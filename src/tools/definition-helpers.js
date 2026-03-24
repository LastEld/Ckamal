/**
 * Create a tool definition.
 * Kept separate from the registry to avoid circular imports inside tool definition modules.
 *
 * @param {Object} config - Tool configuration
 * @returns {Object} Tool definition
 */
export function createTool(config) {
  return {
    name: config.name,
    description: config.description,
    inputSchema: config.inputSchema,
    outputSchema: config.outputSchema,
    handler: config.handler,
    tags: config.tags || [],
    requiresAuth: config.requiresAuth || false,
    subscription: config.subscription
  };
}

/**
 * Create response schema for tool outputs.
 *
 * @param {z.ZodSchema} dataSchema - Raw data schema
 * @returns {z.ZodSchema} Output schema
 */
export function createResponseSchema(dataSchema) {
  return dataSchema;
}

export default {
  createTool,
  createResponseSchema
};
