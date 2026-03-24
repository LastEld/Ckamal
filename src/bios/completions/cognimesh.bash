#!/bin/bash
# CogniMesh CLI Bash Completion
# Source this file: source cognimesh.bash

_cognimesh_complete() {
    local cur prev opts
    COMPREPLY=()
    cur="${COMP_WORDS[COMP_CWORD]}"
    prev="${COMP_WORDS[COMP_CWORD-1]}"

    # Main commands
    local commands="status clients tasks roadmaps backup vault update help interactive version"
    
    # Client subcommands
    local client_commands="list test kimi claude codex"
    
    # Task subcommands
    local task_commands="create list get update delete"
    
    # Roadmap subcommands
    local roadmap_commands="create list get update delete"
    
    # Backup subcommands
    local backup_commands="create list restore delete"
    
    # Vault subcommands
    local vault_commands="migrate list add remove status"
    
    # Update subcommands
    local update_commands="check apply rollback history"

    case "${COMP_CWORD}" in
        1)
            COMPREPLY=( $(compgen -W "${commands}" -- ${cur}) )
            ;;
        2)
            case "${prev}" in
                clients)
                    COMPREPLY=( $(compgen -W "${client_commands}" -- ${cur}) )
                    ;;
                tasks)
                    COMPREPLY=( $(compgen -W "${task_commands}" -- ${cur}) )
                    ;;
                roadmaps)
                    COMPREPLY=( $(compgen -W "${roadmap_commands}" -- ${cur}) )
                    ;;
                backup)
                    COMPREPLY=( $(compgen -W "${backup_commands}" -- ${cur}) )
                    ;;
                vault)
                    COMPREPLY=( $(compgen -W "${vault_commands}" -- ${cur}) )
                    ;;
                update)
                    COMPREPLY=( $(compgen -W "${update_commands}" -- ${cur}) )
                    ;;
                *)
                    COMPREPLY=()
                    ;;
            esac
            ;;
        *)
            # Handle options for specific subcommands
            case "${COMP_WORDS[1]}" in
                tasks)
                    case "${COMP_WORDS[2]}" in
                        create)
                            COMPREPLY=( $(compgen -W "--priority --assign --tags --due --help" -- ${cur}) )
                            ;;
                        list)
                            COMPREPLY=( $(compgen -W "--filter --status --help" -- ${cur}) )
                            ;;
                    esac
                    ;;
                roadmaps)
                    case "${COMP_WORDS[2]}" in
                        create)
                            COMPREPLY=( $(compgen -W "--description --phases --target --output --help" -- ${cur}) )
                            ;;
                    esac
                    ;;
                backup)
                    case "${COMP_WORDS[2]}" in
                        create)
                            COMPREPLY=( $(compgen -W "--name --help" -- ${cur}) )
                            ;;
                        restore)
                            COMPREPLY=( $(compgen -W "--skip-restart --help" -- ${cur}) )
                            ;;
                    esac
                    ;;
                vault)
                    case "${COMP_WORDS[2]}" in
                        migrate)
                            COMPREPLY=( $(compgen -W "--force --verbose --help" -- ${cur}) )
                            ;;
                    esac
                    ;;
                update)
                    case "${COMP_WORDS[2]}" in
                        apply)
                            COMPREPLY=( $(compgen -W "--force --help" -- ${cur}) )
                            ;;
                    esac
                    ;;
            esac
            ;;
    esac
}

complete -F _cognimesh_complete cognimesh
complete -F _cognimesh_complete cm
