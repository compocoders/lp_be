import { ApiError } from '../utils/ApiError.js';

// ─── Remote Code Execution (Judge0 API) ──────────────────────────────────────
// Uses the free public Judge0 CE API for secure, isolated code execution supporting many languages.
export const SUPPORTED_LANGUAGES = {
  javascript: { language_id: 63 }, // Node.js
  python: { language_id: 71 }, // Python 3
  java: { language_id: 62 }, // Java
  'c++': { language_id: 54 }, // C++ (GCC)
  c: { language_id: 50 }, // C (GCC)
};

/**
 * Execute source code remotely via Judge0 API.
 */
export const runCode = async ({ language, sourceCode, stdin = '' }) => {
  const normalizedLang = language?.toLowerCase();
  const langConfig = SUPPORTED_LANGUAGES[normalizedLang];
  
  if (!langConfig) {
    throw new ApiError(400, `Unsupported language for execution. Supported: ${Object.keys(SUPPORTED_LANGUAGES).join(', ')}`);
  }

  try {
    const response = await fetch('https://ce.judge0.com/submissions?base64_encoded=false&wait=true', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        language_id: langConfig.language_id,
        source_code: sourceCode,
        stdin: stdin || "",
      })
    });

    if (!response.ok) {
      // Judge0 returns 422 if Unprocessable Entity
      if (response.status === 422) {
        throw new Error('Invalid code payload.');
      }
      throw new Error(`Execution API Error: ${response.statusText}`);
    }

    const data = await response.json();

    const statusId = data.status?.id;
    const statusDescription = data.status?.description?.toLowerCase() || '';
    const compileOutput = typeof data.compile_output === 'string' ? data.compile_output : '';
    const hasCompileOutput = compileOutput.trim().length > 0;
    const hasCompileError = statusId === 6 || statusDescription.includes('compile') || statusDescription.includes('compilation') || hasCompileOutput;
    const isSuccess = statusId === 3;

    return {
      status: isSuccess ? 'accepted' : (hasCompileError ? 'compile_error' : 'runtime_error'),
      stdout: data.stdout || '',
      stderr: data.stderr || '',
      compileOutput,
      success: isSuccess,
    };
  } catch (error) {
    return {
      status: 'error',
      stdout: '',
      stderr: error.message || 'Failed to connect to execution engine.',
      compileOutput: '',
      success: false,
    };
  }
};

/**
 * List available languages for the frontend language picker.
 */
export const getSupportedLanguages = () =>
  Object.entries(SUPPORTED_LANGUAGES).map(([name]) => ({ name, id: name }));

