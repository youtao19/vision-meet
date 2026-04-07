const cwd = options.cwd || process.cwd();
const { session, modelFallbackMessage } = await createAgentSession({
  cwd,
  agentDir: piAgentDir,
  authStorage,
  modelRegistry,
  model: selectedModel,
  thinkingLevel: "off",
  sessionManager: SessionManager.create(cwd, taskSessionDir),
  resourceLoader,
  tools: [],
});
