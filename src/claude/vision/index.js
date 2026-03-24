/**
 * Claude Vision Module
 * Vision/image analysis with Claude AI capabilities
 * 
 * @module claude/vision
 * @version 1.0.0
 */

import { randomUUID } from "crypto";
import {
    detectMimeTypeFromBuffer,
    validateImage,
    preprocessImage,
    toClaudeImageBlock,
    getSupportedFormats,
    ImagePreprocessor
} from "./preprocessor.js";

// Claude API configuration (subscription-based auth only - no API keys)
const CLAUDE_API_URL = process.env.CLAUDE_BASE_URL || "https://claude.ai/api";
const CLAUDE_API_VERSION = process.env.CLAUDE_API_VERSION || "2024-01-01";
const CLAUDE_VISION_MODEL = process.env.CLAUDE_VISION_MODEL || "claude-3-5-sonnet-20241022";

/**
 * VisionAnalyzer class for image analysis with Claude
 */
export class VisionAnalyzer {
    /**
     * @param {object} options - Analyzer options
     * @param {string} options.model - Claude model to use
     * @param {number} options.maxTokens - Max tokens for response
     * @param {number} options.timeout - Request timeout in ms
     * @param {string} options.sessionToken - Subscription session token
     */
    constructor(options = {}) {
        this.model = options.model || CLAUDE_VISION_MODEL;
        this.maxTokens = options.maxTokens || 4096;
        this.timeout = options.timeout || 120000;
        this.sessionToken = options.sessionToken || process.env.CLAUDE_SESSION_TOKEN;
        this.baseUrl = options.baseUrl || CLAUDE_API_URL;
        this.apiVersion = options.apiVersion || CLAUDE_API_VERSION;
        
        this.preprocessor = new ImagePreprocessor(options.preprocessor);
        
        this.stats = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            totalTokensUsed: 0
        };
    }

    /**
     * Analyze a single image with Claude vision
     * @param {string|Buffer} imageData - Base64-encoded image or Buffer
     * @param {string} prompt - Analysis prompt/question
     * @param {object} options - Analysis options
     * @returns {Promise<object>} Analysis result
     */
    async analyzeImage(imageData, prompt, options = {}) {
        const startTime = Date.now();
        
        try {
            // Convert to buffer if needed
            const buffer = Buffer.isBuffer(imageData) 
                ? imageData 
                : Buffer.from(imageData, "base64");
            
            const mimeType = detectMimeTypeFromBuffer(buffer);
            
            if (!mimeType) {
                throw new VisionError("Unable to detect image format. Supported: PNG, JPG, WebP, GIF", "INVALID_FORMAT");
            }

            const validation = validateImage(buffer, mimeType);
            if (!validation.valid) {
                throw new VisionError(`Image validation failed: ${validation.errors.join(", ")}`, "VALIDATION_ERROR");
            }

            // Preprocess if needed
            let processedBuffer = buffer;
            if (options.preprocess !== false) {
                const preprocessed = await preprocessImage(buffer, { 
                    mimeType,
                    autoResize: options.autoResize !== false 
                });
                if (preprocessed.processed?.buffer) {
                    processedBuffer = preprocessed.processed.buffer;
                }
            }

            // Build request
            const imageBlock = toClaudeImageBlock(processedBuffer, mimeType);
            const messages = [{
                role: "user",
                content: [
                    imageBlock,
                    { type: "text", text: prompt }
                ]
            }];

            // Call Claude API
            const response = await this.callClaude(messages, {
                model: options.model || this.model,
                maxTokens: options.maxTokens || this.maxTokens,
                temperature: options.temperature,
                system: options.system
            });

            this.stats.totalRequests++;
            this.stats.successfulRequests++;
            this.stats.totalTokensUsed += response.usage?.total_tokens || 0;

            return {
                success: true,
                result: response.content[0]?.text || "",
                model: response.model,
                usage: response.usage,
                processingTimeMs: Date.now() - startTime,
                metadata: {
                    mimeType,
                    imageSize: buffer.length,
                    prompt
                }
            };
        } catch (error) {
            this.stats.totalRequests++;
            this.stats.failedRequests++;
            
            return {
                success: false,
                error: error.message,
                code: error.code || "ANALYSIS_ERROR",
                processingTimeMs: Date.now() - startTime
            };
        }
    }

    /**
     * Analyze multiple images in batch
     * @param {Array} images - Array of image data objects
     * @param {string} prompt - Analysis prompt/question for all images
     * @param {object} options - Batch options
     * @returns {Promise<object>} Batch analysis results
     */
    async analyzeImages(images, prompt, options = {}) {
        const startTime = Date.now();
        const { concurrency = 3, continueOnError = true } = options;

        const results = [];
        const errors = [];

        for (let i = 0; i < images.length; i += concurrency) {
            const batch = images.slice(i, i + concurrency);
            
            const batchPromises = batch.map(async (item, idx) => {
                const imageIndex = i + idx;
                const imageData = typeof item === "string" ? item : item.data || item.base64;
                const itemPrompt = (typeof item === "object" && item.prompt) ? item.prompt : prompt;
                const itemOptions = (typeof item === "object" && item.options) ? item.options : {};

                try {
                    const result = await this.analyzeImage(imageData, itemPrompt, itemOptions);
                    return { index: imageIndex, ...result };
                } catch (error) {
                    if (!continueOnError) throw error;
                    return { index: imageIndex, success: false, error: error.message };
                }
            });

            const batchResults = await Promise.all(batchPromises);
            
            for (const result of batchResults) {
                if (result.success) {
                    results.push(result);
                } else {
                    errors.push(result);
                }
            }

            // Progress callback
            if (options.onProgress) {
                options.onProgress({
                    completed: results.length,
                    failed: errors.length,
                    total: images.length,
                    percent: Math.round((results.length + errors.length) / images.length * 100)
                });
            }
        }

        return {
            success: errors.length === 0 || (results.length > 0 && continueOnError),
            total: images.length,
            completed: results.length,
            failed: errors.length,
            results: results.sort((a, b) => a.index - b.index),
            errors: errors.sort((a, b) => a.index - b.index),
            processingTimeMs: Date.now() - startTime
        };
    }

    /**
     * Extract text from an image (OCR functionality)
     * @param {string|Buffer} imageData - Base64-encoded image or Buffer
     * @param {object} options - OCR options
     * @returns {Promise<object>} OCR result with extracted text
     */
    async extractText(imageData, options = {}) {
        const prompt = options.prompt || 
            "Extract all text from this image. Return the text exactly as it appears, preserving line breaks and formatting where possible.";
        
        const result = await this.analyzeImage(imageData, prompt, options);
        
        if (result.success) {
            return {
                ...result,
                text: result.result,
                confidence: options.includeConfidence ? this.estimateConfidence(result.result) : undefined
            };
        }
        
        return result;
    }

    /**
     * Generate a description of an image
     * @param {string|Buffer} imageData - Base64-encoded image or Buffer
     * @param {object} options - Description options
     * @returns {Promise<object>} Description result
     */
    async describeImage(imageData, options = {}) {
        const detailLevel = options.detail || "standard"; // 'brief', 'standard', 'detailed'
        
        const prompts = {
            brief: "Provide a brief one-sentence description of this image.",
            standard: "Describe this image in detail. Include the main subjects, setting, colors, and any notable elements.",
            detailed: "Provide a comprehensive description of this image. Include: main subjects and their actions, setting/environment, colors and lighting, composition, mood/atmosphere, and any text or symbols present. Be thorough and specific."
        };
        
        const prompt = options.customPrompt || prompts[detailLevel] || prompts.standard;
        
        const result = await this.analyzeImage(imageData, prompt, options);
        
        if (result.success) {
            return {
                ...result,
                description: result.result,
                detailLevel
            };
        }
        
        return result;
    }

    /**
     * Compare two images
     * @param {string|Buffer} imageData1 - First image
     * @param {string|Buffer} imageData2 - Second image
     * @param {object} options - Comparison options
     * @returns {Promise<object>} Comparison result
     */
    async compareImages(imageData1, imageData2, options = {}) {
        const prompt = options.prompt || 
            "Compare these two images. Describe the similarities and differences between them.";
        
        const startTime = Date.now();
        
        try {
            const buffer1 = Buffer.isBuffer(imageData1) ? imageData1 : Buffer.from(imageData1, "base64");
            const buffer2 = Buffer.isBuffer(imageData2) ? imageData2 : Buffer.from(imageData2, "base64");
            
            const mimeType1 = detectMimeTypeFromBuffer(buffer1);
            const mimeType2 = detectMimeTypeFromBuffer(buffer2);
            
            const imageBlock1 = toClaudeImageBlock(buffer1, mimeType1 || "image/png");
            const imageBlock2 = toClaudeImageBlock(buffer2, mimeType2 || "image/png");
            
            const messages = [{
                role: "user",
                content: [
                    { type: "text", text: "Image 1:" },
                    imageBlock1,
                    { type: "text", text: "Image 2:" },
                    imageBlock2,
                    { type: "text", text: prompt }
                ]
            }];

            const response = await this.callClaude(messages, {
                model: options.model || this.model,
                maxTokens: options.maxTokens || this.maxTokens
            });

            return {
                success: true,
                comparison: response.content[0]?.text || "",
                model: response.model,
                usage: response.usage,
                processingTimeMs: Date.now() - startTime
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                code: error.code || "COMPARISON_ERROR",
                processingTimeMs: Date.now() - startTime
            };
        }
    }

    /**
     * Call Claude API with messages
     * @private
     */
    async callClaude(messages, options = {}) {
        if (!this.sessionToken) {
            throw new VisionError("No session token configured. Set CLAUDE_SESSION_TOKEN for subscription access.", "AUTH_ERROR");
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
            const response = await fetch(`${this.baseUrl}/chat`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-API-Version": this.apiVersion,
                    "X-Session-Token": this.sessionToken,
                    "X-Request-ID": randomUUID()
                },
                body: JSON.stringify({
                    model: options.model || this.model,
                    max_tokens: options.maxTokens || this.maxTokens,
                    messages,
                    ...(options.temperature !== undefined && { temperature: options.temperature }),
                    ...(options.system && { system: options.system })
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new VisionError(
                    errorData.error?.message || `HTTP ${response.status}`,
                    `HTTP_${response.status}`
                );
            }

            return await response.json();
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === "AbortError") {
                throw new VisionError(`Request timeout after ${this.timeout}ms`, "TIMEOUT");
            }
            throw error;
        }
    }

    /**
     * Estimate confidence based on result characteristics
     * @private
     */
    estimateConfidence(text) {
        // Simple heuristic based on text characteristics
        if (!text || text.length < 10) return 0.3;
        if (text.includes("unable to") || text.includes("cannot")) return 0.4;
        if (text.length > 100) return 0.9;
        return 0.7;
    }

    /**
     * Get analyzer statistics
     * @returns {object} Statistics
     */
    getStats() {
        return { ...this.stats };
    }

    /**
     * Get supported formats
     * @returns {object} Format information
     */
    getSupportedFormats() {
        return getSupportedFormats();
    }

    /**
     * Clean up resources
     */
    dispose() {
        this.preprocessor.dispose();
    }
}

/**
 * Vision Error class
 */
export class VisionError extends Error {
    /**
     * @param {string} message - Error message
     * @param {string} code - Error code
     * @param {Error} [cause] - Original error
     */
    constructor(message, code, cause) {
        super(message);
        this.name = "VisionError";
        this.code = code;
        this.cause = cause;
    }
}

// Convenience functions

/**
 * Quick analyze image helper
 * @param {string|Buffer} imageData - Image data
 * @param {string} prompt - Analysis prompt
 * @param {object} options - Options
 * @returns {Promise<object>} Analysis result
 */
export async function analyzeImage(imageData, prompt, options = {}) {
    const analyzer = new VisionAnalyzer(options);
    return analyzer.analyzeImage(imageData, prompt, options);
}

/**
 * Quick analyze multiple images helper
 * @param {Array} images - Images to analyze
 * @param {string} prompt - Default prompt
 * @param {object} options - Batch options
 * @returns {Promise<object>} Batch results
 */
export async function analyzeImages(images, prompt, options = {}) {
    const analyzer = new VisionAnalyzer(options);
    return analyzer.analyzeImages(images, prompt, options);
}

/**
 * Quick extract text helper
 * @param {string|Buffer} imageData - Image data
 * @param {object} options - OCR options
 * @returns {Promise<object>} OCR result
 */
export async function extractText(imageData, options = {}) {
    const analyzer = new VisionAnalyzer(options);
    return analyzer.extractText(imageData, options);
}

/**
 * Quick describe image helper
 * @param {string|Buffer} imageData - Image data
 * @param {object} options - Description options
 * @returns {Promise<object>} Description result
 */
export async function describeImage(imageData, options = {}) {
    const analyzer = new VisionAnalyzer(options);
    return analyzer.describeImage(imageData, options);
}

export default VisionAnalyzer;
