/**
 * Example: Claude VSCode Client Integration
 * 
 * Демонстрация использования ClaudeVSCodeClient для интеграции
 * с Anthropic Sonnet 4.6 VSCode Extension
 */

import { ClaudeVSCodeClient } from '../src/clients/claude/ide.js';

async function main() {
  // Создание клиента
  const client = new ClaudeVSCodeClient({
    port: 16100,                    // TCP порт (если используется TCP)
    // socketPath: '/custom/path',  // Или путь к Unix сокету
    cacheTimeout: 30000,            // Кэширование completion
    rootUri: 'file:///workspace/project'
  });

  try {
    console.log('🚀 Инициализация Claude VSCode Client...');
    await client.initialize();
    console.log('✅ Клиент подключен');
    console.log('📋 Capabilities:', client.getCapabilities());

    // Открытие документа
    const documentUri = 'file:///workspace/project/src/app.js';
    const code = `
import express from 'express';

const app = express();

// TODO: добавить middleware для авторизации
// FIXME: утечка памяти в обработчике

app.get('/api/users', async (req, res) => {
  const users = await db.users.findAll();
  res.json(users);
});

// @roadmap[phase-2-api]
app.post('/api/users', async (req, res) => {
  // TODO: валидация входных данных
  const user = await db.users.create(req.body);
  res.status(201).json(user);
});

export default app;
`;

    console.log('\n📄 Открытие документа...');
    await client.openDocument(documentUri, 'javascript', 1, code);

    // Inline Completion
    console.log('\n💡 Запрос inline completion...');
    const completions = await client.inlineCompletion(
      { uri: documentUri, text: code, languageId: 'javascript' },
      { line: 8, character: 4 },  // позиция внутри обработчика GET
      { triggerKind: 1 }
    );
    console.log('Completions:', completions);

    // Hover Information
    console.log('\n🔍 Запрос hover info...');
    const hover = await client.provideHover(
      { uri: documentUri },
      { line: 6, character: 10 }  // позиция на 'express'
    );
    console.log('Hover:', hover);

    // Diagnostics (включая CogniMesh-specific)
    console.log('\n🩺 Получение диагностик...');
    const diagnostics = await client.diagnostics({ uri: documentUri, text: code });
    console.log('Diagnostics:', diagnostics);

    // Code Actions
    console.log('\n⚡ Получение code actions...');
    const actions = await client.codeAction(
      { uri: documentUri },
      {
        start: { line: 10, character: 0 },
        end: { line: 12, character: 3 }
      },
      { diagnostics: [] }
    );
    console.log('Code Actions:', actions);

    // Создание задачи из кода
    console.log('\n📝 Создание задачи из TODO комментария...');
    const task = await client.createTaskFromCode(
      { uri: documentUri, text: code, languageId: 'javascript' },
      {
        start: { line: 6, character: 0 },
        end: { line: 6, character: 50 }
      },
      {
        title: 'Добавить middleware авторизации',
        type: 'security-task',
        priority: 'high',
        tags: ['security', 'auth', 'middleware']
      }
    );
    console.log('Created Task:', task);

    // Связь с roadmap
    console.log('\n🗺️ Связь с roadmap node...');
    const linkResult = await client.linkToRoadmap(
      { uri: documentUri },
      {
        start: { line: 16, character: 0 },
        end: { line: 21, character: 3 }
      },
      'phase-2-api'
    );
    console.log('Roadmap Link:', linkResult);

    // Go to Definition
    console.log('\n➡️  Go to Definition...');
    const definitions = await client.goToDefinition(
      { uri: documentUri },
      { line: 10, character: 10 }  // 'app.get'
    );
    console.log('Definitions:', definitions);

    // Find All References
    console.log('\n🔗 Find All References...');
    const references = await client.findAllReferences(
      { uri: documentUri },
      { line: 4, character: 6 },  // 'app'
      true
    );
    console.log('References:', references);

    // Rename Symbol
    console.log('\n✏️  Rename Symbol...');
    const renameEdit = await client.renameSymbol(
      { uri: documentUri },
      { line: 4, character: 6 },  // 'app'
      'application'
    );
    console.log('Rename Edit:', renameEdit);

    // Добавление аннотации
    console.log('\n💭 Добавление code annotation...');
    const annotation = await client.addCodeAnnotation(
      { uri: documentUri },
      {
        start: { line: 8, character: 0 },
        end: { line: 12, character: 3 }
      },
      {
        type: 'review-note',
        content: 'Проверить SQL инъекции',
        author: 'senior-dev',
        metadata: { priority: 'high', category: 'security' }
      }
    );
    console.log('Annotation:', annotation);

    // Получение всех аннотаций документа
    console.log('\n📋 Все аннотации документа...');
    const annotations = await client.getDocumentAnnotations(documentUri);
    console.log('Annotations:', annotations);

    // Закрытие документа
    console.log('\n📄 Закрытие документа...');
    await client.closeDocument(documentUri);

    // Отключение
    console.log('\n👋 Отключение клиента...');
    await client.disconnect();
    console.log('✅ Отключено');

  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    process.exit(1);
  }
}

// Обработка событий клиента
function setupEventHandlers(client) {
  client.on('ready', (capabilities) => {
    console.log('🎉 Клиент готов к работе!');
    console.log('Server capabilities:', capabilities);
  });

  client.on('diagnostics', ({ uri, diagnostics }) => {
    console.log(`📊 Диагностики для ${uri}:`, diagnostics.length, 'items');
  });

  client.on('notification', (notification) => {
    console.log('🔔 Уведомление:', notification);
  });

  client.on('progress', (params) => {
    console.log('📈 Прогресс:', params.token, params.value);
  });

  client.on('disconnected', () => {
    console.log('⚠️  Соединение разорвано');
  });

  client.on('error', (error) => {
    console.error('💥 Ошибка клиента:', error.message);
  });
}

// Запуск примера
main();
