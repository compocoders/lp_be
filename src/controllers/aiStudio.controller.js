import { prisma } from '../config/db.js';
import { generateContentWithRetry, getFlashModel } from '../services/ai.service.js';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { env } from '../config/env.js';
import { parseFileForGemini, s3Client } from './ai.controller.js';

const systemInstruction = "You are Likhâ, a friendly, human-like AI tutor. Your goal is to help students and teachers study their learning materials. Provide highly accurate information, but deliver it in a natural, conversational, and empathetic tone. Avoid sounding overly robotic, rigid, or excessively structured (like starting every point with a bullet unless necessary). Speak as if you are a real human tutor sitting next to them. CRITICAL INSTRUCTION: Write the response entirely in plain, natural human text. DO NOT use any Markdown formatting. DO NOT use asterisks (*), hashes (#), or any special formatting symbols. Use natural paragraph spacing.";

// --- CONVERSATIONS ---

export const getConversations = async (req, res, next) => {
  try {
    const { materialId } = req.params;
    const conversations = await prisma.aiConversation.findMany({
      where: {
        learningMaterialId: materialId,
        userId: req.user.id,
        OR: [
          { isSaved: true },
          { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }
        ]
      },
      orderBy: { updatedAt: 'desc' }
    });
    res.status(200).json(conversations);
  } catch (error) {
    next(error);
  }
};

export const createConversation = async (req, res, next) => {
  try {
    const { materialId, title } = req.body;
    const conversation = await prisma.aiConversation.create({
      data: {
        learningMaterialId: materialId,
        userId: req.user.id,
        title: title || "New Conversation"
      }
    });
    res.status(201).json(conversation);
  } catch (error) {
    next(error);
  }
};

export const deleteConversation = async (req, res, next) => {
  try {
    const { id } = req.params;
    await prisma.aiConversation.delete({ where: { id } });
    res.status(200).json({ message: "Conversation deleted" });
  } catch (error) {
    next(error);
  }
};

export const toggleSaveConversation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { isSaved } = req.body;
    const conversation = await prisma.aiConversation.update({
      where: { id },
      data: { isSaved }
    });
    res.status(200).json(conversation);
  } catch (error) {
    next(error);
  }
};

export const getMessages = async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const messages = await prisma.aiMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' }
    });
    res.status(200).json(messages);
  } catch (error) {
    next(error);
  }
};

export const sendMessage = async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const { text } = req.body;

    // 1. Fetch conversation to get material
    const conversation = await prisma.aiConversation.findUnique({
      where: { id: conversationId },
      include: { LearningMaterial: true }
    });

    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    // 2. Fetch and parse material
    let materialContext = "";
    let inlineData = null;

    if (conversation.LearningMaterial?.fileUrl) {
        const key = conversation.LearningMaterial.fileUrl.replace(env.R2_PUBLIC_URL + '/', '');
        try {
            const command = new GetObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key });
            const s3Response = await s3Client.send(command);
            const fileBuffer = await s3Response.Body.transformToByteArray();
            const parsed = await parseFileForGemini(key, fileBuffer);
            materialContext = parsed.extractedText;
            inlineData = parsed.inlineData;
        } catch (e) {
            console.error("Failed to parse material for studio", e);
        }
    }

    // 3. Save user message
    await prisma.aiMessage.create({
      data: {
        conversationId,
        sender: "user",
        content: text
      }
    });

    // 4. Fetch recent conversation history to provide to the model
    const history = await prisma.aiMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: 10 // send last 10 messages for context
    });

    // Construct prompt
    let promptText = `System: ${systemInstruction}\n\n`;
    if (materialContext) {
      const textStr = typeof materialContext === 'string' ? materialContext : String(materialContext);
      promptText += `Context Material:\n"""\n${textStr.substring(0, 30000)}\n"""\n\n`;
    }
    
    promptText += "Chat History:\n";
    history.forEach(msg => {
      promptText += `${msg.sender === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n`;
    });
    
    promptText += `\nAssistant:`;

    const parts = [];
    if (inlineData) parts.push({ inlineData });
    parts.push({ text: promptText });

    // 5. Call AI
    const primaryModel = getFlashModel();
    const result = await generateContentWithRetry(primaryModel, parts, req.tokenWallet);
    const aiReply = result.response.text();

    // 4. Save AI message
    const aiMessage = await prisma.aiMessage.create({
      data: {
        conversationId,
        sender: "ai",
        content: aiReply
      }
    });

    // 5. Update conversation timestamp
    await prisma.aiConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() }
    });

    // 6. Deduct token (rough estimate based on length, or hardcode 10)
    let tokensToDeduct = 10;
    if (result.response.usageMetadata) {
      tokensToDeduct = Math.max(1, Math.floor(result.response.usageMetadata.totalTokenCount / 10));
    }
    if (req.tokenWallet) {
      await req.tokenWallet.deductTokens(tokensToDeduct);
    }

    let newTitle = undefined;
    if (history.length === 0) {
      // Background title generation for the first message
      getFlashModel().generateContent(`Generate a short, concise 2-4 word title for a conversation that starts with this message: "${text.substring(0, 500)}". Reply ONLY with the title. Do not use quotes or special formatting.`)
        .then(result => {
           let title = result.response.text().trim().replace(/["'*]/g, '');
           if (title.length > 50) title = title.substring(0, 50); // safety length limit
           prisma.aiConversation.update({ where: { id: conversationId }, data: { title } }).catch(console.error);
        })
        .catch(console.error);
      
      // Give it a temporary fast title client-side or just wait for next fetch.
      // Wait, we can generate it synchronously to return it immediately!
      // But we already did the AI call. Let's just generate it synchronously!
      try {
        const titleResult = await getFlashModel().generateContent(`Generate a short, concise 2-4 word title for a conversation that starts with this message: "${text.substring(0, 500)}". Reply ONLY with the title. Do not use quotes or special formatting.`);
        newTitle = titleResult.response.text().trim().replace(/["'*]/g, '');
        if (newTitle.length > 50) newTitle = newTitle.substring(0, 50);
        await prisma.aiConversation.update({ where: { id: conversationId }, data: { title: newTitle } });
      } catch (e) {
        console.error("Failed to generate title", e);
      }
    }

    res.status(200).json({ 
      reply: aiMessage.content, 
      remainingTokens: req.tokenWallet ? req.tokenWallet.availableTokens - tokensToDeduct : undefined,
      title: newTitle
    });
  } catch (error) {
    next(error);
  }
};

// --- STUDY MATERIALS ---

export const getSavedMaterials = async (req, res, next) => {
  try {
    const { materialId } = req.params;
    const materials = await prisma.aiStudyMaterial.findMany({
      where: {
        learningMaterialId: materialId,
        userId: req.user.id
      },
      orderBy: { createdAt: 'desc' }
    });
    res.status(200).json(materials);
  } catch (error) {
    next(error);
  }
};

export const saveStudyMaterial = async (req, res, next) => {
  try {
    const { materialId, type, content } = req.body;
    const saved = await prisma.aiStudyMaterial.create({
      data: {
        learningMaterialId: materialId,
        userId: req.user.id,
        type,
        content
      }
    });
    res.status(201).json(saved);
  } catch (error) {
    next(error);
  }
};

export const deleteSavedMaterial = async (req, res, next) => {
  try {
    const { id } = req.params;
    await prisma.aiStudyMaterial.delete({ where: { id } });
    res.status(200).json({ message: "Saved material deleted" });
  } catch (error) {
    next(error);
  }
};
