import { ApiError } from '../utils/ApiError.js';
import { exec } from 'child_process';
import { writeFile, unlink } from 'fs/promises';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';
import util from 'util';

const execAsync = util.promisify(exec);

// ─── Local Code Execution (Free & Open Source) ────────────────────────────────
// Instead of an external API, we run the code directly on the server using 
// standard installed compilers/interpreters. 
// Note: Ensure Node.js and Python are installed on the host machine.
export const SUPPORTED_LANGUAGES = {
  javascript: 'node',
  python: 'python', // Standard command on Windows
};

/**
 * Execute source code locally with a strict timeout.
 */
export const runCode = async ({ language, sourceCode, stdin = '' }) => {
  const normalizedLang = language?.toLowerCase();
  const cmd = SUPPORTED_LANGUAGES[normalizedLang];
  
  if (!cmd) {
    throw new ApiError(400, `Unsupported language for local execution. Supported: ${Object.keys(SUPPORTED_LANGUAGES).join(', ')}`);
  }

  // 1. Create a secure temporary file
  const ext = normalizedLang === 'javascript' ? 'js' : 'py';
  const fileName = `exec_${randomUUID()}.${ext}`;
  const filePath = path.join(os.tmpdir(), fileName);

  try {
    // 2. Write the student's code to the file
    await writeFile(filePath, sourceCode);

    // 3. Execute the file with a strict 5-second timeout to prevent infinite loops
    let command = `"${cmd}" "${filePath}"`;

    // Note: If stdin is provided, we echo it into the command (Windows-friendly approach)
    if (stdin && stdin.trim() !== '') {
      // Escape quotes for Windows CMD
      const safeStdin = stdin.replace(/"/g, '\\"');
      command = `echo "${safeStdin}" | ${command}`;
    }

    const { stdout, stderr } = await execAsync(command, { timeout: 5000 });

    return {
      status: 'accepted',
      stdout: stdout || '',
      stderr: stderr || '',
      compileOutput: '',
      success: true,
    };

  } catch (error) {
    // child_process.exec throws an error if the process exits with a non-zero code or times out
    const isTimeout = error.killed;
    
    return {
      status: isTimeout ? 'time_limit_exceeded' : 'runtime_error',
      stdout: error.stdout || '',
      stderr: error.stderr || '',
      compileOutput: isTimeout ? 'Execution timed out after 5 seconds.' : (error.stderr || error.message),
      success: false,
    };
  } finally {
    // 4. Always clean up the temporary file
    try {
      await unlink(filePath);
    } catch (e) {
      // Ignore unlink errors if file was already deleted
    }
  }
};

/**
 * List available languages for the frontend language picker.
 */
export const getSupportedLanguages = () =>
  Object.entries(SUPPORTED_LANGUAGES).map(([name]) => ({ name, id: name }));

