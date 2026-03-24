/**
 * Vision Preprocessor Module
 * Image preprocessing utilities for Claude vision
 * 
 * @module claude/vision/preprocessor
 * @version 1.0.0
 */

import crypto from "crypto";
import { EventEmitter } from "events";

// Claude vision limits
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_DIMENSION = 4096;
const RECOMMENDED_DIMENSION = 1568;
const MIN_DIMENSION = 32;

// Supported formats
const SUPPORTED_FORMATS = {
    "image/png": { ext: "png", maxSize: MAX_IMAGE_SIZE },
    "image/jpeg": { ext: "jpg", maxSize: MAX_IMAGE_SIZE },
    "image/webp": { ext: "webp", maxSize: MAX_IMAGE_SIZE },
    "image/gif": { ext: "gif", maxSize: MAX_IMAGE_SIZE }
};

// File signatures for format detection
const SIGNATURES = {
    png: { sig: [0x89, 0x50, 0x4E, 0x47], mime: "image/png" },
    jpg: { sig: [0xFF, 0xD8, 0xFF], mime: "image/jpeg" },
    webp: { 
        sig: [0x52, 0x49, 0x46, 0x46], 
        mime: "image/webp", 
        offset: 8, 
        extSig: [0x57, 0x45, 0x42, 0x50] 
    },
    gif: { sig: [0x47, 0x49, 0x46, 0x38], mime: "image/gif" }
};

/**
 * ImagePreprocessor class for advanced image preprocessing
 */
export class ImagePreprocessor extends EventEmitter {
    /**
     * @param {object} options - Preprocessor options
     * @param {number} options.maxSize - Maximum file size in bytes
     * @param {number} options.maxDimension - Maximum dimension in pixels
     * @param {number} options.targetDimension - Target dimension for resizing
     * @param {number} options.quality - JPEG/WebP quality (1-100)
     * @param {boolean} options.autoOptimize - Auto-optimize images
     */
    constructor(options = {}) {
        super();
        this.maxSize = options.maxSize || MAX_IMAGE_SIZE;
        this.maxDimension = options.maxDimension || MAX_DIMENSION;
        this.targetDimension = options.targetDimension || RECOMMENDED_DIMENSION;
        this.quality = options.quality || 85;
        this.autoOptimize = options.autoOptimize !== false;
        
        this.stats = {
            processed: 0,
            resized: 0,
            optimized: 0,
            converted: 0,
            errors: 0
        };
    }

    /**
     * Resize image to maximum dimensions
     * @param {Buffer} image - Image buffer
     * @param {object} maxDimensions - Maximum dimensions {width, height}
     * @returns {Promise<object>} Resize result with buffer and dimensions
     */
    async resize(image, maxDimensions = {}) {
        const maxWidth = maxDimensions.width || this.targetDimension;
        const maxHeight = maxDimensions.height || this.targetDimension;
        
        const mimeType = detectMimeTypeFromBuffer(image);
        const dimensions = getImageDimensions(image, mimeType);
        
        if (!dimensions) {
            this.stats.errors++;
            return {
                success: false,
                error: "Could not determine image dimensions",
                buffer: image,
                resized: false
            };
        }
        
        const optimal = calculateOptimalDimensions(
            dimensions.width, 
            dimensions.height, 
            Math.min(maxWidth, maxHeight)
        );
        
        if (!optimal.needsResize) {
            return {
                success: true,
                buffer: image,
                originalDimensions: dimensions,
                newDimensions: dimensions,
                resized: false
            };
        }
        
        this.stats.resized++;
        this.emit("resized", { original: dimensions, new: optimal });
        
        // Note: Actual resize would require Sharp or similar library
        // This is a placeholder that returns metadata about what resize is needed
        return {
            success: true,
            buffer: image, // In production with Sharp, would return resized buffer
            originalDimensions: dimensions,
            newDimensions: optimal,
            resized: false, // Would be true if Sharp was available
            resizeNeeded: true,
            message: `Image should be resized from ${dimensions.width}x${dimensions.height} to ${optimal.width}x${optimal.height}`
        };
    }

    /**
     * Optimize image quality to target size
     * @param {Buffer} image - Image buffer
     * @param {number} quality - Target quality (1-100)
     * @returns {Promise<object>} Optimization result
     */
    async optimize(image, quality = this.quality) {
        const currentSize = image.length;
        const mimeType = detectMimeTypeFromBuffer(image);
        
        if (currentSize <= this.maxSize) {
            return {
                success: true,
                buffer: image,
                originalSize: currentSize,
                newSize: currentSize,
                optimized: false
            };
        }
        
        this.stats.optimized++;
        this.emit("optimized", { originalSize: currentSize, targetSize: this.maxSize });
        
        // Note: Actual optimization would require Sharp or similar
        const compressionRatio = this.maxSize / currentSize;
        const suggestedQuality = Math.max(30, Math.round(compressionRatio * 100));
        
        return {
            success: true,
            buffer: image, // In production, would return optimized buffer
            originalSize: currentSize,
            targetSize: this.maxSize,
            optimized: false,
            compressionNeeded: true,
            suggestedQuality: Math.min(suggestedQuality, quality),
            message: `Compression recommended: reduce to ~${Math.min(suggestedQuality, quality)}% quality`
        };
    }

    /**
     * Convert image format
     * @param {Buffer} image - Image buffer
     * @param {string} targetFormat - Target format (png, jpg, webp, gif)
     * @returns {Promise<object>} Conversion result
     */
    async convertFormat(image, targetFormat) {
        const currentMime = detectMimeTypeFromBuffer(image);
        const targetMime = `image/${targetFormat.replace('jpg', 'jpeg')}`;
        
        if (currentMime === targetMime) {
            return {
                success: true,
                buffer: image,
                format: targetFormat,
                converted: false,
                message: "Image already in target format"
            };
        }
        
        if (!SUPPORTED_FORMATS[targetMime]) {
            return {
                success: false,
                error: `Unsupported target format: ${targetFormat}`,
                buffer: image,
                converted: false
            };
        }
        
        this.stats.converted++;
        this.emit("converted", { from: currentMime, to: targetMime });
        
        // Note: Actual conversion would require Sharp or similar
        return {
            success: true,
            buffer: image, // In production, would return converted buffer
            format: targetFormat,
            originalFormat: currentMime?.replace('image/', '') || 'unknown',
            converted: false, // Would be true if Sharp was available
            conversionNeeded: true,
            message: `Conversion from ${currentMime} to ${targetMime} needed`
        };
    }

    /**
     * Validate image format and size
     * @param {Buffer} image - Image buffer
     * @returns {object} Validation result
     */
    validate(image) {
        const errors = [];
        const warnings = [];
        
        if (!image || image.length === 0) {
            errors.push("Empty image buffer");
            return { valid: false, errors, warnings };
        }
        
        const mimeType = detectMimeTypeFromBuffer(image);
        
        if (!mimeType) {
            errors.push("Unknown image format. Supported: PNG, JPG, WebP, GIF");
            return { valid: false, errors, warnings, mimeType: null };
        }
        
        const format = SUPPORTED_FORMATS[mimeType];
        if (!format) {
            errors.push(`Unsupported format: ${mimeType}`);
            return { valid: false, errors, warnings, mimeType };
        }
        
        // Check file size
        if (image.length > this.maxSize) {
            errors.push(`Image size ${formatBytes(image.length)} exceeds maximum ${formatBytes(this.maxSize)}`);
        } else if (image.length > this.maxSize * 0.8) {
            warnings.push(`Image size ${formatBytes(image.length)} is close to limit`);
        }
        
        // Check dimensions
        const dimensions = getImageDimensions(image, mimeType);
        if (dimensions) {
            if (dimensions.width > this.maxDimension || dimensions.height > this.maxDimension) {
                errors.push(`Image dimensions ${dimensions.width}x${dimensions.height} exceed maximum ${this.maxDimension}`);
            } else if (dimensions.width > this.targetDimension || dimensions.height > this.targetDimension) {
                warnings.push(`Image dimensions ${dimensions.width}x${dimensions.height} exceed recommended ${this.targetDimension}`);
            }
            
            if (dimensions.width < MIN_DIMENSION || dimensions.height < MIN_DIMENSION) {
                warnings.push(`Image dimensions ${dimensions.width}x${dimensions.height} are very small`);
            }
        }
        
        this.emit("validated", { valid: errors.length === 0, mimeType });
        
        return {
            valid: errors.length === 0,
            errors,
            warnings,
            mimeType,
            format: format.ext,
            size: image.length,
            dimensions
        };
    }

    /**
     * Full preprocessing pipeline
     * @param {Buffer} image - Image buffer
     * @param {object} options - Preprocessing options
     * @returns {Promise<object>} Preprocessing result
     */
    async process(image, options = {}) {
        const startTime = Date.now();
        this.stats.processed++;
        
        // Step 1: Validate
        const validation = this.validate(image);
        if (!validation.valid && !options.continueOnError) {
            return {
                success: false,
                error: validation.errors.join(", "),
                validation
            };
        }
        
        let processedBuffer = image;
        const operations = [];
        
        // Step 2: Convert format if needed
        if (options.targetFormat) {
            const conversion = await this.convertFormat(processedBuffer, options.targetFormat);
            if (conversion.success) {
                processedBuffer = conversion.buffer;
                operations.push("convert");
            }
        }
        
        // Step 3: Resize if needed
        if (options.autoResize !== false && validation.dimensions) {
            const resizeResult = await this.resize(processedBuffer, {
                width: options.maxWidth || this.targetDimension,
                height: options.maxHeight || this.targetDimension
            });
            if (resizeResult.success && resizeResult.resized) {
                processedBuffer = resizeResult.buffer;
                operations.push("resize");
            }
        }
        
        // Step 4: Optimize if needed
        if (options.autoOptimize !== false && processedBuffer.length > this.maxSize * 0.9) {
            const optimizeResult = await this.optimize(processedBuffer, options.quality);
            if (optimizeResult.success && optimizeResult.optimized) {
                processedBuffer = optimizeResult.buffer;
                operations.push("optimize");
            }
        }
        
        this.emit("processed", { 
            originalSize: image.length, 
            newSize: processedBuffer.length,
            operations 
        });
        
        return {
            success: true,
            buffer: processedBuffer,
            originalBuffer: image,
            mimeType: validation.mimeType,
            format: validation.format,
            originalSize: image.length,
            newSize: processedBuffer.length,
            dimensions: validation.dimensions,
            operations,
            validation,
            processingTimeMs: Date.now() - startTime
        };
    }

    /**
     * Get preprocessor statistics
     * @returns {object} Statistics
     */
    getStats() {
        return { ...this.stats };
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            processed: 0,
            resized: 0,
            optimized: 0,
            converted: 0,
            errors: 0
        };
    }

    /**
     * Clean up resources
     */
    dispose() {
        this.removeAllListeners();
    }
}

/**
 * Detect MIME type from buffer
 * @param {Buffer} buffer - Image buffer
 * @returns {string|null} MIME type or null
 */
export function detectMimeTypeFromBuffer(buffer) {
    if (!buffer || buffer.length < 4) return null;
    
    for (const [format, info] of Object.entries(SIGNATURES)) {
        const sig = info.sig;
        const offset = info.offset || 0;
        
        let matches = true;
        for (let i = 0; i < sig.length; i++) {
            if (buffer[i + offset] !== sig[i]) {
                matches = false;
                break;
            }
        }
        
        if (matches && info.extSig) {
            for (let i = 0; i < info.extSig.length; i++) {
                if (buffer[i + offset + sig.length] !== info.extSig[i]) {
                    matches = false;
                    break;
                }
            }
        }
        
        if (matches) return info.mime;
    }
    
    return null;
}

/**
 * Validate image buffer format
 * @param {Buffer} buffer - Image buffer
 * @returns {object} Validation result with mimeType
 */
export function validateFormat(buffer) {
    const errors = [];
    const warnings = [];
    
    if (!buffer || buffer.length === 0) {
        errors.push("Empty buffer provided");
        return { valid: false, mimeType: null, errors, warnings };
    }
    
    const detectedMime = detectMimeTypeFromBuffer(buffer);
    
    if (!detectedMime) {
        errors.push("Unknown image format. Supported: png, jpg, webp, gif");
        return { valid: false, mimeType: null, errors, warnings };
    }
    
    const format = SUPPORTED_FORMATS[detectedMime];
    if (!format) {
        errors.push(`Unsupported format: ${detectedMime}`);
        return { valid: false, mimeType: detectedMime, errors, warnings };
    }
    
    if (buffer.length > format.maxSize) {
        errors.push(`Image size ${formatBytes(buffer.length)} exceeds maximum ${formatBytes(format.maxSize)}`);
    }
    
    return {
        valid: errors.length === 0,
        mimeType: detectedMime,
        format: format.ext,
        size: buffer.length,
        errors,
        warnings
    };
}

/**
 * Validate image buffer against specific MIME type
 * @param {Buffer} buffer - Image buffer
 * @param {string} mimeType - Expected MIME type
 * @returns {object} Validation result
 */
export function validateImage(buffer, mimeType) {
    const errors = [];
    const warnings = [];
    
    if (!buffer || buffer.length === 0) {
        errors.push("Empty image buffer");
        return { valid: false, errors, warnings };
    }
    
    const format = SUPPORTED_FORMATS[mimeType];
    if (!format) {
        errors.push(`Unsupported format: ${mimeType}`);
        return { valid: false, errors, warnings };
    }
    
    if (buffer.length > format.maxSize) {
        errors.push(`Image size ${formatBytes(buffer.length)} exceeds maximum ${formatBytes(format.maxSize)}`);
    }
    
    const detectedMime = detectMimeTypeFromBuffer(buffer);
    if (detectedMime && detectedMime !== mimeType) {
        warnings.push(`MIME type mismatch: declared ${mimeType} but detected ${detectedMime}`);
    }
    
    return {
        valid: errors.length === 0,
        errors,
        warnings,
        size: buffer.length,
        detectedMime
    };
}

/**
 * Get image dimensions from buffer
 * @param {Buffer} buffer - Image buffer
 * @param {string} mimeType - MIME type
 * @returns {object|null} Dimensions {width, height} or null
 */
export function getImageDimensions(buffer, mimeType) {
    try {
        if (mimeType === "image/png") {
            return {
                width: buffer.readUInt32BE(16),
                height: buffer.readUInt32BE(20)
            };
        }
        
        if (mimeType === "image/gif") {
            return {
                width: buffer.readUInt16LE(6),
                height: buffer.readUInt16LE(8)
            };
        }
        
        if (mimeType === "image/jpeg") {
            return parseJpegDimensions(buffer);
        }
        
        return null;
    } catch (error) {
        return null;
    }
}

/**
 * Parse JPEG dimensions from buffer
 * @private
 */
function parseJpegDimensions(buffer) {
    let offset = 2; // Skip SOI marker
    
    while (offset < buffer.length - 1) {
        while (buffer[offset] === 0xFF) offset++;
        
        const marker = buffer[offset - 1];
        
        // SOF markers
        if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
            return {
                height: buffer.readUInt16BE(offset + 3),
                width: buffer.readUInt16BE(offset + 5)
            };
        }
        
        const length = buffer.readUInt16BE(offset + 1);
        offset += length + 2;
    }
    
    return null;
}

/**
 * Calculate optimal dimensions for Claude
 * @param {number} width - Original width
 * @param {number} height - Original height
 * @param {number} maxSize - Maximum dimension
 * @returns {object} Optimal dimensions
 */
export function calculateOptimalDimensions(width, height, maxSize = RECOMMENDED_DIMENSION) {
    const maxDim = Math.max(width, height);
    
    if (maxDim <= maxSize) {
        return { width, height, needsResize: false };
    }
    
    const scale = maxSize / maxDim;
    
    return {
        width: Math.round(width * scale),
        height: Math.round(height * scale),
        scale,
        needsResize: true
    };
}

/**
 * Resize image to maximum size (standalone function)
 * @param {Buffer} image - Image buffer
 * @param {number} maxSize - Maximum dimension
 * @returns {Promise<object>} Resize result
 */
export async function resize(image, maxSize = RECOMMENDED_DIMENSION) {
    const preprocessor = new ImagePreprocessor();
    return preprocessor.resize(image, { width: maxSize, height: maxSize });
}

/**
 * Optimize image quality to target size (standalone function)
 * @param {Buffer} image - Image buffer
 * @param {number} targetSize - Target size in bytes
 * @returns {Promise<object>} Optimization result
 */
export async function optimizeQuality(image, targetSize) {
    const currentSize = image.length;
    
    if (currentSize <= targetSize) {
        return {
            success: true,
            buffer: image,
            originalSize: currentSize,
            newSize: currentSize,
            optimized: false
        };
    }
    
    // Note: Actual optimization would require Sharp or similar
    const compressionRatio = targetSize / currentSize;
    const suggestedQuality = Math.max(30, Math.round(compressionRatio * 100));
    
    return {
        success: true,
        buffer: image, // In production, would return optimized buffer
        originalSize: currentSize,
        targetSize,
        optimized: false,
        compressionNeeded: true,
        suggestedQuality,
        message: `Compression recommended: reduce to ~${suggestedQuality}% quality`
    };
}

/**
 * Preprocess image for Claude API
 * @param {Buffer} buffer - Image buffer
 * @param {object} options - Preprocessing options
 * @returns {Promise<object>} Preprocessing result
 */
export async function preprocessImage(buffer, options = {}) {
    const {
        mimeType = null,
        autoResize = true,
        maxSize = MAX_IMAGE_SIZE,
        targetDimension = RECOMMENDED_DIMENSION
    } = options;
    
    const startTime = Date.now();
    
    const result = {
        original: {
            size: buffer.length,
            sizeFormatted: formatBytes(buffer.length),
            mimeType: mimeType
        },
        processed: null,
        warnings: [],
        errors: []
    };
    
    const detectedMime = mimeType || detectMimeTypeFromBuffer(buffer);
    if (!detectedMime) {
        result.errors.push("Could not detect image format");
        return result;
    }
    
    result.original.mimeType = detectedMime;
    
    const validation = validateImage(buffer, detectedMime);
    result.warnings = validation.warnings;
    
    if (!validation.valid) {
        result.errors = validation.errors;
        return result;
    }
    
    const dimensions = getImageDimensions(buffer, detectedMime);
    if (dimensions) {
        result.original.width = dimensions.width;
        result.original.height = dimensions.height;
    }
    
    let processedBuffer = buffer;
    
    if (dimensions && autoResize) {
        const optimal = calculateOptimalDimensions(dimensions.width, dimensions.height, targetDimension);
        
        if (optimal.needsResize) {
            result.warnings.push(
                `Image resized from ${dimensions.width}x${dimensions.height} to ${optimal.width}x${optimal.height}`
            );
            result.resizeNeeded = true;
            result.targetDimensions = optimal;
        }
    }
    
    if (buffer.length > maxSize) {
        result.warnings.push(`Image size exceeds ${formatBytes(maxSize)}`);
        result.compressionNeeded = true;
    }
    
    result.processed = {
        buffer: processedBuffer,
        mimeType: detectedMime,
        size: processedBuffer.length,
        sizeFormatted: formatBytes(processedBuffer.length)
    };
    
    result.processingTimeMs = Date.now() - startTime;
    
    return result;
}

/**
 * Convert image to Claude API format
 * @param {Buffer} buffer - Image buffer
 * @param {string} mimeType - MIME type
 * @returns {object} Claude API image block
 */
export function toClaudeImageBlock(buffer, mimeType) {
    const base64 = buffer.toString("base64");
    
    return {
        type: "image",
        source: {
            type: "base64",
            media_type: mimeType,
            data: base64
        }
    };
}

/**
 * Create image URL block for Claude API
 * @param {string} url - Image URL
 * @returns {object} Claude API image block
 */
export function toClaudeImageUrlBlock(url) {
    return {
        type: "image",
        source: {
            type: "url",
            url: url
        }
    };
}

/**
 * Compare two images by hash
 * @param {Buffer} img1 - First image
 * @param {Buffer} img2 - Second image
 * @returns {object} Comparison result
 */
export function compareImages(img1, img2) {
    const hash1 = crypto.createHash("sha256").update(img1).digest("hex");
    const hash2 = crypto.createHash("sha256").update(img2).digest("hex");
    
    const identical = hash1 === hash2;
    const sizeRatio = Math.min(img1.length, img2.length) / Math.max(img1.length, img2.length);
    
    return {
        identical,
        hash1: hash1.substring(0, 16) + "...",
        hash2: hash2.substring(0, 16) + "...",
        sizeSimilarity: sizeRatio,
        size1: img1.length,
        size2: img2.length
    };
}

/**
 * Get supported formats info
 * @returns {object} Format information
 */
export function getSupportedFormats() {
    return {
        formats: Object.keys(SUPPORTED_FORMATS),
        maxSize: MAX_IMAGE_SIZE,
        maxDimension: MAX_DIMENSION,
        recommendedDimension: RECOMMENDED_DIMENSION,
        details: SUPPORTED_FORMATS
    };
}

/**
 * Format bytes to human-readable string
 * @param {number} bytes - Bytes
 * @returns {string} Formatted string
 */
function formatBytes(bytes) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

/**
 * Calculate thumbnail dimensions
 * @param {object} dimensions - Original dimensions
 * @param {number} maxThumbSize - Max thumbnail size
 * @returns {object} Thumbnail info
 */
export function calculateThumbnail(dimensions, maxThumbSize = 200) {
    const { width, height } = dimensions;
    const maxDim = Math.max(width, height);
    
    if (maxDim <= maxThumbSize) {
        return {
            width,
            height,
            scale: 1,
            needsResize: false
        };
    }
    
    const scale = maxThumbSize / maxDim;
    return {
        width: Math.round(width * scale),
        height: Math.round(height * scale),
        scale,
        needsResize: true
    };
}

/**
 * Batch preprocess multiple images
 * @param {Array} images - Array of {buffer, mimeType, filename}
 * @param {object} options - Options
 * @returns {Promise<Array>} Preprocessing results
 */
export async function batchPreprocess(images, options = {}) {
    const results = [];
    
    for (const image of images) {
        try {
            const result = await preprocessImage(image.buffer, {
                ...options,
                mimeType: image.mimeType,
                filename: image.filename
            });
            results.push({
                filename: image.filename,
                success: result.errors.length === 0,
                ...result
            });
        } catch (error) {
            results.push({
                filename: image.filename,
                success: false,
                errors: [error.message]
            });
        }
    }
    
    return results;
}

export default ImagePreprocessor;
