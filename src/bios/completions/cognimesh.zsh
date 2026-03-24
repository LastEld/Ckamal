#compdef cognimesh cm
# CogniMesh CLI Zsh Completion

_cognimesh() {
    local curcontext="$curcontext" state line
    typeset -A opt_args

    _arguments -C \
        '(-h --help)'{-h,--help}'[Show help message]' \
        '(-v --version)'{-v,--version}'[Show version]' \
        '(-i --interactive)'{-i,--interactive}'[Start interactive mode]' \
        '(--no-color)'--no-color'[Disable colored output]' \
        '1: :_cognimesh_commands' \
        '*:: :->args'

    case "$state" in
        args)
            case "$line[1]" in
                clients)
                    _cognimesh_clients
                    ;;
                tasks)
                    _cognimesh_tasks
                    ;;
                roadmaps)
                    _cognimesh_roadmaps
                    ;;
                backup)
                    _cognimesh_backup
                    ;;
                vault)
                    _cognimesh_vault
                    ;;
                update)
                    _cognimesh_update
                    ;;
            esac
            ;;
    esac
}

_cognimesh_commands() {
    local commands
    commands=(
        'status:Show system status'
        'clients:Manage AI clients'
        'tasks:Manage tasks'
        'roadmaps:Manage project roadmaps'
        'backup:Create and restore backups'
        'vault:Manage secrets and credentials'
        'update:Check and apply updates'
        'help:Show help information'
        'interactive:Start interactive mode'
        'version:Show version'
    )
    _describe -t commands 'cognimesh commands' commands "$@"
}

_cognimesh_clients() {
    local subcmds
    subcmds=(
        'list:List all available clients'
        'test:Test all client connections'
        'kimi:Kimi AI client operations'
        'claude:Claude client operations'
        'codex:Codex client operations'
    )
    _describe -t subcmds 'client subcommands' subcmds "$@"
}

_cognimesh_tasks() {
    local subcmds
    subcmds=(
        'create:Create a new task'
        'list:List all tasks'
        'get:Get task details'
        'update:Update task status'
        'delete:Delete a task'
    )
    _describe -t subcmds 'task subcommands' subcmds "$@"
}

_cognimesh_roadmaps() {
    local subcmds
    subcmds=(
        'create:Create a new roadmap'
        'list:List all roadmaps'
        'get:Get roadmap details'
        'update:Update a roadmap'
        'delete:Delete a roadmap'
    )
    _describe -t subcmds 'roadmap subcommands' subcmds "$@"
}

_cognimesh_backup() {
    local subcmds
    subcmds=(
        'create:Create a new backup'
        'list:List all backups'
        'restore:Restore from backup'
        'delete:Delete a backup'
    )
    _describe -t subcmds 'backup subcommands' subcmds "$@"
}

_cognimesh_vault() {
    local subcmds
    subcmds=(
        'migrate:Migrate secrets from .env'
        'list:List vault secrets'
        'add:Add a secret'
        'remove:Remove a secret'
        'status:Show vault status'
    )
    _describe -t subcmds 'vault subcommands' subcmds "$@"
}

_cognimesh_update() {
    local subcmds
    subcmds=(
        'check:Check for available updates'
        'apply:Apply available updates'
        'rollback:Rollback to previous version'
        'history:Show update history'
    )
    _describe -t subcmds 'update subcommands' subcmds "$@"
}

# Complete options for specific subcommands
_cognimesh_tasks_create() {
    _arguments \
        '(--priority)'--priority='[Task priority]:priority:(low normal high urgent)' \
        '(--assign)'--assign='[Assign to client]:client:(kimi claude codex)' \
        '(--tags)'--tags='[Comma-separated tags]' \
        '(--due)'--due='[Due date]'
}

_cognimesh_roadmaps_create() {
    _arguments \
        '(--description)'--description='[Roadmap description]' \
        '(--phases)'--phases='[JSON array of phases]' \
        '(--target)'--target='[Target completion date]' \
        '(--output)'--output='[Output file]:file:_files'
}

_cognimesh_backup_create() {
    _arguments \
        '(--name)'--name='[Backup name]'
}

_cognimesh_vault_migrate() {
    _arguments \
        '(--force)'--force'[Force re-migration]' \
        '(--verbose)'--verbose'[Verbose output]'
}

_cognimesh_update_apply() {
    _arguments \
        '(--force)'--force'[Skip confirmation]'
}

_cognimesh "$@"
