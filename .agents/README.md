# Agents Directory

This directory contains agent-related resources for the CogniMesh project.

## Structure

### skills/
Contains skill definitions for different agent roles. Each skill file defines the capabilities, tools, and templates for a specific agent type.

**Files:**
- `architect.md` - System Architect skill template
- `developer.md` - Developer skill template
- `analyst.md` - Analyst skill template
- `tester.md` - Tester skill template
- `devops.md` - DevOps skill template

### spawns/
Directory for agent spawn configurations and templates. Used to define how new agent instances are created and initialized.

### handoffs/
Directory for agent handoff protocols and templates. Defines how work is transferred between different agents.

## Usage

When creating a new agent:
1. Select the appropriate skill template from `skills/`
2. Configure the agent spawn in `spawns/`
3. Define handoff protocols in `handoffs/` if needed

## Adding New Skills

To add a new skill:
1. Create a new `.md` file in `skills/`
2. Follow the SKILL.md format:
   - Purpose
   - Capabilities
   - Tools
   - CV Template
   - Usage
3. Update this README to include the new skill
