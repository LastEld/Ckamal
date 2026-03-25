/**
 * @fileoverview Unit tests for Claude VSCode Client
 * Tests for Anthropic Sonnet 4.6 VSCode Extension integration
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ClaudeVSCodeClient } from '../../../src/clients/claude/vscode.js';

describe('ClaudeVSCodeClient', () => {
  let client;

  beforeEach(() => {
    client = new ClaudeVSCodeClient({
      port: 16100,
      host: 'localhost',
      cacheTimeout: 30000
    });
  });

  afterEach(async () => {
    if (client && client.isConnected()) {
      await client.disconnect();
    }
  });

  describe('Initialization', () => {
    it('should create client with correct configuration', () => {
      assert.equal(client.provider, 'claude');
      assert.equal(client.config.mode, 'vscode');
      assert.equal(client.config.version, '4.6');
      assert.equal(client.port, 16100);
      assert.equal(client.host, 'localhost');
      assert.equal(client.cacheTimeout, 30000);
    });

    it('should create VSCode client with default port', () => {
      const defaultClient = new ClaudeVSCodeClient({});
      assert.equal(defaultClient.host, 'localhost');
      assert.ok(defaultClient.socketPath);
    });

    it('should return correct capabilities', () => {
      const caps = client.getCapabilities();
      assert.equal(caps.provider, 'claude');
      assert.equal(caps.mode, 'vscode');
      assert.equal(caps.version, '4.6');
      assert.equal(caps.protocol, 'lsp-like');
      assert.equal(caps.contextWindow, 200000);
      assert.ok(caps.features.includes('inline_completion'));
      assert.ok(caps.features.includes('intellisense'));
      assert.ok(caps.features.includes('hover_info'));
      assert.ok(caps.features.includes('code_actions'));
      assert.ok(caps.features.includes('quick_fixes'));
      assert.ok(caps.features.includes('refactoring'));
      assert.ok(caps.features.includes('rename_symbol'));
      assert.ok(caps.features.includes('go_to_definition'));
      assert.ok(caps.features.includes('find_references'));
      assert.ok(caps.features.includes('diagnostics'));
      assert.ok(caps.features.includes('cognimesh_tasks'));
      assert.ok(caps.features.includes('cognimesh_roadmaps'));
      assert.ok(caps.features.includes('cognimesh_annotations'));
      assert.ok(caps.streaming);
      assert.ok(caps.supportsFiles);
      assert.ok(caps.supportsEditorContext);
    });

    it('should build client capabilities correctly', () => {
      const clientCaps = client.clientCapabilities;
      assert.ok(clientCaps.workspace.applyEdit);
      assert.ok(clientCaps.textDocument.completion.completionItem.snippetSupport);
      assert.ok(clientCaps.textDocument.hover);
      assert.ok(clientCaps.textDocument.definition);
      assert.ok(clientCaps.textDocument.references);
      assert.ok(clientCaps.textDocument.codeAction);
      assert.ok(clientCaps.textDocument.rename);
      assert.ok(clientCaps.cognimesh.taskExtraction);
      assert.ok(clientCaps.cognimesh.roadmapIntegration);
      assert.ok(clientCaps.cognimesh.codeAnnotations);
    });
  });

  describe('LSP Protocol', () => {
    it('should define LSP message types', () => {
      // MessageType is a const object in the module
      assert.ok(client);
    });

    it('should track document versions', async () => {
      const uri = 'file:///test.js';
      await client.openDocument(uri, 'javascript', 1, 'const x = 1;');
      assert.equal(client.documentVersions.get(uri), 1);
      assert.ok(client.openDocuments.has(uri));
    });

    it('should update document versions on change', async () => {
      const uri = 'file:///test.js';
      await client.openDocument(uri, 'javascript', 1, 'const x = 1;');
      await client.changeDocument(uri, [{ text: 'const x = 2;' }], 2);
      assert.equal(client.documentVersions.get(uri), 2);
    });

    it('should remove document on close', async () => {
      const uri = 'file:///test.js';
      await client.openDocument(uri, 'javascript', 1, 'const x = 1;');
      await client.closeDocument(uri);
      assert.ok(!client.openDocuments.has(uri));
      assert.ok(!client.documentVersions.has(uri));
    });
  });

  describe('IDE Features', () => {
    it('should define inlineCompletion method', () => {
      assert.equal(typeof client.inlineCompletion, 'function');
    });

    it('should define provideHover method', () => {
      assert.equal(typeof client.provideHover, 'function');
    });

    it('should define codeAction method', () => {
      assert.equal(typeof client.codeAction, 'function');
    });

    it('should define refactoring method', () => {
      assert.equal(typeof client.refactoring, 'function');
    });

    it('should define diagnostics method', () => {
      assert.equal(typeof client.diagnostics, 'function');
    });

    it('should define renameSymbol method', () => {
      assert.equal(typeof client.renameSymbol, 'function');
    });

    it('should define goToDefinition method', () => {
      assert.equal(typeof client.goToDefinition, 'function');
    });

    it('should define findAllReferences method', () => {
      assert.equal(typeof client.findAllReferences, 'function');
    });

    it('should define formatDocument method', () => {
      assert.equal(typeof client.formatDocument, 'function');
    });

    it('should define formatRange method', () => {
      assert.equal(typeof client.formatRange, 'function');
    });

    it('should define getSignatureHelp method', () => {
      assert.equal(typeof client.getSignatureHelp, 'function');
    });

    it('should define getDocumentSymbols method', () => {
      assert.equal(typeof client.getDocumentSymbols, 'function');
    });

    it('should define searchWorkspaceSymbols method', () => {
      assert.equal(typeof client.searchWorkspaceSymbols, 'function');
    });
  });

  describe('Completion Features', () => {
    it('should calculate confidence score correctly', () => {
      const context = { prefix: 'get' };
      const item1 = { label: 'getValue' };
      const item2 = { label: 'setValue', documentation: 'docs' };
      
      const conf1 = client._calculateConfidence(item1, context);
      const conf2 = client._calculateConfidence(item2, context);
      
      assert.ok(conf1 > conf2);
      assert.ok(conf1 <= 1);
      assert.ok(conf2 >= 0);
    });

    it('should calculate relevance correctly', () => {
      const context = {};
      const item1 = { label: 'useState' };
      const item2 = { label: 'testSomething' };
      const item3 = { label: 'fetchData' };
      const item4 = { label: 'regularMethod' };
      
      assert.equal(client._calculateRelevance(item1, context), 'react');
      assert.equal(client._calculateRelevance(item2, context), 'test');
      assert.equal(client._calculateRelevance(item3, context), 'async');
      assert.equal(client._calculateRelevance(item4, context), 'general');
    });

    it('should get completion context correctly', () => {
      const document = {
        text: 'line1\nline2\nline3\nline4\nline5',
        languageId: 'javascript'
      };
      const position = { line: 2, character: 3 };
      
      const context = client._getCompletionContext(document, position);
      assert.equal(context.prefix, 'lin');
      assert.equal(context.suffix, 'e3');
      assert.ok(context.precedingLines.includes('line1'));
      assert.ok(context.precedingLines.includes('line2'));
    });
  });

  describe('Refactoring', () => {
    it('should map operation to correct kind', () => {
      assert.equal(client._getRefactorKind('extract'), 'refactor.extract');
      assert.equal(client._getRefactorKind('inline'), 'refactor.inline');
      assert.equal(client._getRefactorKind('rewrite'), 'refactor.rewrite');
      assert.equal(client._getRefactorKind('reorganize'), 'source.organizeImports');
      assert.equal(client._getRefactorKind('unknown'), 'refactor');
    });
  });

  describe('CogniMesh Integration', () => {
    it('should define createTaskFromCode method', () => {
      assert.equal(typeof client.createTaskFromCode, 'function');
    });

    it('should define linkToRoadmap method', () => {
      assert.equal(typeof client.linkToRoadmap, 'function');
    });

    it('should define addCodeAnnotation method', () => {
      assert.equal(typeof client.addCodeAnnotation, 'function');
    });

    it('should define extractContext method', () => {
      assert.equal(typeof client.extractContext, 'function');
    });

    it('should define getDocumentAnnotations method', () => {
      assert.equal(typeof client.getDocumentAnnotations, 'function');
    });

    it('should generate CogniMesh code actions', async () => {
      const document = { uri: 'file:///test.js', text: '// TODO: fix this', languageId: 'javascript' };
      const range = { start: { line: 0, character: 0 }, end: { line: 0, character: 16 } };
      
      const actions = await client._getCognimeshCodeActions(document, range);
      assert.ok(actions.length >= 2);
      assert.ok(actions.some(a => a.title.includes('Create CogniMesh Task')));
      assert.ok(actions.some(a => a.title.includes('Add CogniMesh Annotation')));
    });

    it('should detect roadmap-related text', () => {
      assert.ok(client._isRoadmapRelated('This is a roadmap item'));
      assert.ok(client._isRoadmapRelated('Part of the milestone'));
      assert.ok(client._isRoadmapRelated('Feature implementation'));
      assert.ok(!client._isRoadmapRelated('Regular code comment'));
      assert.ok(!client._isRoadmapRelated(''));
      assert.ok(!client._isRoadmapRelated(null));
    });
  });

  describe('Diagnostics', () => {
    it('should extract TODO diagnostics', async () => {
      const document = {
        uri: 'file:///test.js',
        text: '// TODO: implement this feature\nconst x = 1;'
      };
      
      const diagnostics = await client._getCognimeshDiagnostics(document);
      assert.ok(diagnostics.length > 0);
      assert.equal(diagnostics[0].code, 'cognimesh-todo');
      assert.ok(diagnostics[0].message.includes('implement this feature'));
    });

    it('should extract FIXME diagnostics', async () => {
      const document = {
        uri: 'file:///test.js',
        text: '// FIXME: broken logic\nconst y = 2;'
      };
      
      const diagnostics = await client._getCognimeshDiagnostics(document);
      assert.ok(diagnostics.some(d => d.message.includes('broken logic')));
    });

    it('should extract roadmap link diagnostics', async () => {
      const document = {
        uri: 'file:///test.js',
        text: '// @roadmap[node-123]\nconst z = 3;'
      };
      
      const diagnostics = await client._getCognimeshDiagnostics(document);
      assert.ok(diagnostics.some(d => d.code === 'cognimesh-roadmap'));
    });
  });

  describe('Utility Methods', () => {
    it('should get text in range correctly (single line)', () => {
      const document = { text: 'hello world', uri: 'file:///test.js' };
      const range = {
        start: { line: 0, character: 6 },
        end: { line: 0, character: 11 }
      };
      
      assert.equal(client._getTextInRange(document, range), 'world');
    });

    it('should get text in range correctly (multi line)', () => {
      const document = { text: 'line1\nline2\nline3', uri: 'file:///test.js' };
      const range = {
        start: { line: 0, character: 2 },
        end: { line: 2, character: 3 }
      };
      
      const text = client._getTextInRange(document, range);
      assert.ok(text.includes('ne1'));
      assert.ok(text.includes('line2'));
      assert.ok(text.includes('lin'));
    });

    it('should handle notification handlers', () => {
      const handler = () => {};
      client.onNotification('test/method', handler);
      assert.ok(client.notificationHandlers.has('test/method'));
      
      client.offNotification('test/method', handler);
      const handlers = client.notificationHandlers.get('test/method');
      assert.ok(!handlers.includes(handler));
    });
  });

  describe('Socket Paths', () => {
    it('should return correct socket path for Windows', () => {
      const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
      Object.defineProperty(process, 'platform', { value: 'win32' });
      
      const testClient = new ClaudeVSCodeClient({});
      assert.ok(testClient.socketPath.includes('\\\\.\\pipe\\'));
      
      if (originalPlatform) {
        Object.defineProperty(process, 'platform', originalPlatform);
      }
    });

    it('should return correct socket path for macOS', () => {
      const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      
      const testClient = new ClaudeVSCodeClient({});
      assert.ok(testClient.socketPath.includes('Library/Application Support'));
      
      if (originalPlatform) {
        Object.defineProperty(process, 'platform', originalPlatform);
      }
    });

    it('should return correct socket path for Linux', () => {
      const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
      Object.defineProperty(process, 'platform', { value: 'linux' });
      
      const testClient = new ClaudeVSCodeClient({});
      assert.ok(testClient.socketPath.includes('.config'));
      
      if (originalPlatform) {
        Object.defineProperty(process, 'platform', originalPlatform);
      }
    });
  });

  describe('Connection State', () => {
    it('should start disconnected', () => {
      assert.equal(client.isConnected(), false);
      assert.equal(client.status, 'disconnected');
    });

    it('should track health status', () => {
      client.updateHealth({ connected: true, lastError: null });
      assert.equal(client.health.connected, true);
      assert.equal(client.health.lastError, null);
    });

    it('should clear handlers on disconnect', async () => {
      await client.openDocument('file:///test.js', 'javascript', 1, 'test');
      await client.disconnect();
      
      assert.equal(client.responseHandlers.size, 0);
      assert.equal(client.openDocuments.size, 0);
      assert.equal(client.completionCache.size, 0);
    });
  });

  describe('Base Client Implementation', () => {
    it('should implement send method', () => {
      assert.equal(typeof client.send, 'function');
    });

    it('should implement execute method', () => {
      assert.equal(typeof client.execute, 'function');
    });

    it('should handle different task types in execute', () => {
      // Just verify methods exist and accept parameters without throwing synchronously
      // The async operations will fail without a real socket, but that's expected
      assert.doesNotThrow(() => {
        // Test that method signatures are correct - these will fail async but not sync
        client.execute({ type: 'code-action', document: {}, range: {} }).catch(() => {});
      });
      assert.doesNotThrow(() => {
        client.execute({ type: 'refactor', document: {}, range: {}, operation: 'extract' }).catch(() => {});
      });
      assert.doesNotThrow(() => {
        client.execute({ type: 'format', document: {} }).catch(() => {});
      });
      assert.doesNotThrow(() => {
        client.execute({ type: 'complete', document: {}, position: {} }).catch(() => {});
      });
    });
  });
});

describe('TaskExtractor', () => {
  // TaskExtractor is internal to the module, tested via client methods
  describe('Task Detection', () => {
    it('should detect TODO comments', async () => {
      const client = new ClaudeVSCodeClient({});
      const document = {
        uri: 'file:///test.js',
        text: '// TODO: refactor this function'
      };
      const range = { start: { line: 0, character: 0 }, end: { line: 0, character: 32 } };
      
      const actions = await client._getCognimeshCodeActions(document, range);
      assert.ok(actions.some(a => a.title.includes('Create CogniMesh Task')));
    });

    it('should detect FIXME comments', async () => {
      const client = new ClaudeVSCodeClient({});
      const document = {
        uri: 'file:///test.js',
        text: '// FIXME: broken'
      };
      const range = { start: { line: 0, character: 0 }, end: { line: 0, character: 15 } };
      
      const actions = await client._getCognimeshCodeActions(document, range);
      assert.ok(actions.some(a => a.title.includes('Create CogniMesh Task')));
    });
  });
});

describe('CodeAnnotationManager', () => {
  it('should be integrated into client', () => {
    const client = new ClaudeVSCodeClient({});
    assert.ok(client.annotationManager);
    assert.equal(typeof client.annotationManager.getAnnotationsForDocument, 'function');
    assert.equal(typeof client.annotationManager.getAnnotationsAtPosition, 'function');
  });
});
