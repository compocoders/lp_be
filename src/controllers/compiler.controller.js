import * as compilerService from '../services/compiler.service.js';

export const runCode = async (req, res, next) => {
  try {
    const { language, sourceCode, stdin, expectedOutput } = req.body;
    const result = await compilerService.runCode({ language, sourceCode, stdin, expectedOutput });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const getSupportedLanguages = async (req, res, next) => {
  try {
    const languages = compilerService.getSupportedLanguages();
    res.status(200).json(languages);
  } catch (err) {
    next(err);
  }
};
