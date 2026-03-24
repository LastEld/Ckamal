/**
 * Claude Desktop Client Usage Examples
 * Demonstrates integration with Anthropic Opus 4.6 (1M context window)
 */

import { ClaudeDesktopClient } from '../src/clients/claude/desktop.js';
import { ClientGateway } from '../src/bios/client-gateway.js';

// Example 1: Basic Client Usage
async function basicUsage() {
  console.log('=== Basic Claude Desktop Client Usage ===\n');

  const client = new ClaudeDesktopClient({
    apiHost: 'localhost',
    apiPort: 3456,
    autoReconnect: true,
    maxReconnectAttempts: 5
  });

  try {
    // Initialize connection
    await client.initialize();
    console.log('✓ Client initialized');
    console.log('Status:', client.getStatus());
    console.log('Capabilities:', client.getCapabilities());

    // Send a simple message
    const response = await client.send({
      content: 'Hello Claude! What can you help me with today?'
    });
    console.log('\nResponse:', response);

    // Disconnect
    await client.disconnect();
    console.log('\n✓ Client disconnected');
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Example 2: Streaming Response
async function streamingExample() {
  console.log('\n=== Streaming Response Example ===\n');

  const client = new ClaudeDesktopClient();

  try {
    await client.initialize();

    console.log('Streaming response:');
    let fullResponse = '';

    await client.stream(
      { content: 'Write a short poem about coding' },
      (chunk) => {
        process.stdout.write(chunk);
        fullResponse += chunk;
      }
    );

    console.log('\n\n✓ Stream complete');
    console.log('Full response length:', fullResponse.length);

    await client.disconnect();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Example 3: File Upload
async function fileUploadExample() {
  console.log('\n=== File Upload Example ===\n');

  const client = new ClaudeDesktopClient();

  try {
    await client.initialize();

    // Upload a code file
    const uploadResult = await client.uploadFile('./src/clients/base-client.js', {
      processImmediately: true,
      extractText: true
    });
    console.log('✓ File uploaded:', uploadResult);

    // Ask about the uploaded file
    const response = await client.send({
      content: 'Please analyze this file and explain its architecture.'
    });
    console.log('Analysis:', response);

    await client.disconnect();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Example 4: Coding Tasks
async function codingTasksExample() {
  console.log('\n=== Coding Tasks Example ===\n');

  const client = new ClaudeDesktopClient();

  try {
    await client.initialize();

    // Code Completion
    console.log('1. Code Completion:');
    const completionResult = await client.executeCodingTask('codeCompletion', {
      code: `function fibonacci(n) {\n  // Your code here\n}`,
      language: 'javascript',
      cursorPosition: 35
    });
    console.log('Result:', completionResult);

    // Code Review
    console.log('\n2. Code Review:');
    const reviewResult = await client.executeCodingTask('codeReview', {
      code: `function calculateTotal(items) {
  let total = 0;
  for (let i = 0; i < items.length; i++) {
    total += items[i].price * items[i].quantity;
  }
  return total;
}`,
      language: 'javascript',
      focusAreas: ['performance', 'readability', 'best practices']
    });
    console.log('Review:', reviewResult);

    // Refactoring
    console.log('\n3. Refactoring:');
    const refactorResult = await client.executeCodingTask('refactoring', {
      code: `class User {
  constructor(name, email) {
    this.name = name;
    this.email = email;
  }
  
  save() {
    // Direct database access
    db.query('INSERT INTO users ...', [this.name, this.email]);
  }
}`,
      language: 'javascript',
      goals: ['Apply SOLID principles', 'Separate concerns', 'Improve testability']
    });
    console.log('Refactored:', refactorResult);

    // Debug Assistance
    console.log('\n4. Debug Assistance:');
    const debugResult = await client.executeCodingTask('debugAssistance', {
      code: `async function fetchUserData(userId) {
  const response = await fetch('/api/users/' + userId);
  const data = response.json();
  return data;
}`,
      language: 'javascript',
      error: 'TypeError: data is not iterable',
      errorMessage: 'Promise not awaited'
    });
    console.log('Debug help:', debugResult);

    // Architecture Design
    console.log('\n5. Architecture Design:');
    const archResult = await client.executeCodingTask('architectureDesign', {
      requirements: [
        'Real-time chat application',
        'Support 10,000 concurrent users',
        'Message persistence',
        'End-to-end encryption',
        'Mobile and web clients'
      ],
      techStack: 'Node.js, Redis, PostgreSQL',
      scale: '10k concurrent users'
    });
    console.log('Architecture:', archResult);

    await client.disconnect();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Example 5: Using Client Gateway
async function gatewayExample() {
  console.log('\n=== Client Gateway Example ===\n');

  const gateway = new ClientGateway({
    claude: {
      desktop: { apiPort: 3456 },
      cli: false, // Disable CLI client
      ide: false  // Disable IDE client
    },
    autoReconnect: true,
    healthCheckInterval: 30000
  });

  try {
    // Initialize gateway
    await gateway.initialize();
    console.log('✓ Gateway initialized');
    console.log('Client statuses:', gateway.getAllStatuses());

    // Send message through gateway
    const response = await gateway.sendToClient('claude', 
      'Explain the concept of context windows in LLMs',
      { mode: 'desktop' }
    );
    console.log('Response:', response);

    // Execute coding task through gateway
    const codingResult = await gateway.executeCodingTask('codeReview', {
      code: 'const x = 1;',
      language: 'javascript'
    });
    console.log('Coding result:', codingResult);

    // Stream through gateway
    await gateway.streamFromClient('claude',
      { content: 'Write a haiku about AI' },
      (chunk) => process.stdout.write(chunk)
    );

    // Shutdown
    await gateway.shutdown();
    console.log('\n✓ Gateway shutdown');
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Example 6: Conversation Management
async function conversationExample() {
  console.log('\n=== Conversation Management Example ===\n');

  const client = new ClaudeDesktopClient();

  try {
    await client.initialize();

    // Multi-turn conversation
    const messages = [
      'What is machine learning?',
      'Can you give me a simple example?',
      'How does this relate to neural networks?'
    ];

    for (const message of messages) {
      console.log(`User: ${message}`);
      const response = await client.send({ content: message });
      console.log(`Claude: ${response.content}\n`);
    }

    // Get conversation history
    const history = await client.getConversationHistory({ limit: 10 });
    console.log('Conversation history:', history);

    // Get local cached history
    const localHistory = client.getLocalHistory();
    console.log('Local history entries:', localHistory.length);

    // Check context usage
    const contextUsage = client.getContextUsage();
    console.log('Context usage:', contextUsage);

    await client.disconnect();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Example 7: Health Monitoring
async function healthMonitoringExample() {
  console.log('\n=== Health Monitoring Example ===\n');

  const client = new ClaudeDesktopClient({
    autoReconnect: true,
    reconnectInterval: 3000,
    maxReconnectAttempts: 3
  });

  // Listen to health events
  client.on('health', (health) => {
    console.log('Health update:', health);
  });

  client.on('reconnecting', () => {
    console.log('Reconnecting...');
  });

  client.on('reconnected', () => {
    console.log('Successfully reconnected!');
  });

  client.on('disconnected', () => {
    console.log('Disconnected from Claude Desktop');
  });

  try {
    await client.initialize();
    console.log('Connected, monitoring health...');

    // Simulate health check
    setInterval(async () => {
      try {
        const latency = await client.ping();
        console.log(`Ping: ${latency}ms`);
      } catch (error) {
        console.log('Ping failed:', error.message);
      }
    }, 10000);

    // Keep alive for demo
    await new Promise(resolve => setTimeout(resolve, 60000));

    await client.disconnect();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Run examples
async function main() {
  console.log('Claude Desktop Client Examples');
  console.log('================================\n');

  // Uncomment the examples you want to run:
  
  // await basicUsage();
  // await streamingExample();
  // await fileUploadExample();
  // await codingTasksExample();
  // await gatewayExample();
  // await conversationExample();
  // await healthMonitoringExample();

  console.log('\nExample execution complete!');
}

// Export for use in other modules
export {
  basicUsage,
  streamingExample,
  fileUploadExample,
  codingTasksExample,
  gatewayExample,
  conversationExample,
  healthMonitoringExample
};

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
