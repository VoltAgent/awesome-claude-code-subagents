#!/usr/bin/env bash
#
# Agent Symlink Setup
#
# Creates or removes symlinks from Claude Code and OpenCode config directories
# to the agent definitions in this repository.
#
# Claude Code symlinks directly from categories/ (no generation needed).
# OpenCode symlinks from agent-specific/ (run generate.sh first).
#
# Cursor reads .claude/agents/ and ~/.claude/agents/ natively, so the Claude
# Code symlinks work for Cursor automatically with no extra step.
#
# Usage: ./setup.sh <command> [options]
# Commands:
#   global                  Symlink into global Claude Code and OpenCode config
#   project <path>          Symlink into a project's local config
#   unlink global           Remove global symlinks created by this script
#   unlink project <path>   Remove project symlinks created by this script
#   help                    Show this help message

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_SOURCE="$SCRIPT_DIR/categories"
OUTPUT_DIR="$SCRIPT_DIR/agent-specific"
OPENCODE_OUTPUT="$OUTPUT_DIR/opencode"

GLOBAL_CLAUDE_AGENTS="$HOME/.claude/agents"
GLOBAL_OPENCODE_AGENTS="${XDG_CONFIG_HOME:-$HOME/.config}/opencode/agents"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log_info()    { echo -e "${GREEN}[INFO]${NC}  $1"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC}  $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1"; }
log_skip()    { echo -e "${CYAN}[SKIP]${NC}  $1"; }
log_unlink()  { echo -e "${RED}[UNLINK]${NC} $1"; }

check_generated() {
    if [[ ! -d "$OUTPUT_DIR" ]] || [[ -z "$(ls -A "$OUTPUT_DIR" 2>/dev/null)" ]]; then
        log_warn "agent-specific/ not found or empty. Run ./generate.sh first."
        log_warn "Skipping OpenCode setup."
        return 1
    fi
    return 0
}

link_category_dirs() {
    local source_base="$1"
    local target_base="$2"
    local label="$3"

    mkdir -p "$target_base"

    local linked=0
    local skipped=0

    for source_dir in "$source_base"/*/; do
        [[ -d "$source_dir" ]] || continue

        local category
        category=$(basename "$source_dir")
        local target="$target_base/$category"
        local abs_source
        abs_source="$(cd "$source_dir" && pwd)"

        if [[ -L "$target" ]]; then
            local existing_dest
            existing_dest=$(readlink "$target")
            if [[ "$existing_dest" == "$abs_source" ]]; then
                log_skip "$label: $category (already linked)"
                (( ++skipped ))
                continue
            else
                log_warn "$label: $category -> symlink exists pointing elsewhere, skipping"
                log_warn "  existing: $existing_dest"
                log_warn "  wanted:   $abs_source"
                (( ++skipped ))
                continue
            fi
        elif [[ -e "$target" ]]; then
            log_warn "$label: $category -> path exists and is not a symlink, skipping"
            log_warn "  path: $target"
            (( ++skipped ))
            continue
        fi

        ln -s "$abs_source" "$target"
        log_info "$label: $category -> $target"
        (( ++linked ))
    done

    echo "  $label: $linked linked, $skipped skipped"
}

unlink_category_dirs() {
    local source_base="$1"
    local target_base="$2"
    local label="$3"

    [[ -d "$target_base" ]] || return 0

    local removed=0

    for source_dir in "$source_base"/*/; do
        [[ -d "$source_dir" ]] || continue

        local category
        category=$(basename "$source_dir")
        local target="$target_base/$category"
        local abs_source
        abs_source="$(cd "$source_dir" && pwd)"

        if [[ -L "$target" ]]; then
            local existing_dest
            existing_dest=$(readlink "$target")
            if [[ "$existing_dest" == "$abs_source" ]]; then
                rm "$target"
                log_unlink "$label: $category"
                (( ++removed ))
            else
                log_skip "$label: $category (symlink points elsewhere, leaving untouched)"
            fi
        fi
    done

    echo "  $label: $removed symlinks removed"
}

cmd_global() {
    echo ""
    echo -e "${BOLD}Claude Code - Global${NC}"
    echo "  Target: $GLOBAL_CLAUDE_AGENTS"
    echo ""
    link_category_dirs "$CLAUDE_SOURCE" "$GLOBAL_CLAUDE_AGENTS" "Claude Code"

    if check_generated; then
        echo ""
        echo -e "${BOLD}OpenCode - Global${NC}"
        echo "  Target: $GLOBAL_OPENCODE_AGENTS"
        echo ""
        link_category_dirs "$OPENCODE_OUTPUT" "$GLOBAL_OPENCODE_AGENTS" "OpenCode"
    fi

    echo ""
}

cmd_project() {
    local project_path="${1:-}"

    if [[ -z "$project_path" ]]; then
        log_error "Project path is required"
        echo "Usage: $(basename "$0") project <path>"
        exit 1
    fi

    if [[ ! -d "$project_path" ]]; then
        log_error "Project path does not exist: $project_path"
        exit 1
    fi

    local abs_project
    abs_project="$(cd "$project_path" && pwd)"

    echo ""
    echo -e "${BOLD}Claude Code - Project${NC}"
    echo "  Target: $abs_project/.claude/agents"
    echo ""
    link_category_dirs "$CLAUDE_SOURCE" "$abs_project/.claude/agents" "Claude Code"

    if check_generated; then
        echo ""
        echo -e "${BOLD}OpenCode - Project${NC}"
        echo "  Target: $abs_project/.opencode/agents"
        echo ""
        link_category_dirs "$OPENCODE_OUTPUT" "$abs_project/.opencode/agents" "OpenCode"
    fi

    echo ""
    log_info "Done. Agents are now available in $abs_project"
    echo ""
    log_info "Cursor reads .claude/agents/ natively - no additional setup needed."
}

cmd_unlink_global() {
    echo ""
    echo -e "${BOLD}Removing global Claude Code symlinks${NC}"
    echo ""
    unlink_category_dirs "$CLAUDE_SOURCE" "$GLOBAL_CLAUDE_AGENTS" "Claude Code"

    echo ""
    echo -e "${BOLD}Removing global OpenCode symlinks${NC}"
    echo ""
    unlink_category_dirs "$OPENCODE_OUTPUT" "$GLOBAL_OPENCODE_AGENTS" "OpenCode"
    echo ""
}

cmd_unlink_project() {
    local project_path="${1:-}"

    if [[ -z "$project_path" ]]; then
        log_error "Project path is required"
        echo "Usage: $(basename "$0") unlink project <path>"
        exit 1
    fi

    if [[ ! -d "$project_path" ]]; then
        log_error "Project path does not exist: $project_path"
        exit 1
    fi

    local abs_project
    abs_project="$(cd "$project_path" && pwd)"

    echo ""
    echo -e "${BOLD}Removing project symlinks from $abs_project${NC}"
    echo ""
    unlink_category_dirs "$CLAUDE_SOURCE"   "$abs_project/.claude/agents"   "Claude Code"
    unlink_category_dirs "$OPENCODE_OUTPUT" "$abs_project/.opencode/agents" "OpenCode"
    echo ""
}

usage() {
    cat << EOF
Usage: $(basename "$0") <command> [options]

Commands:
    global                  Symlink agents into global Claude Code and OpenCode config
                            (~/.claude/agents/ and ~/.config/opencode/agents/)

    project <path>          Symlink agents into a project's local config
                            (<path>/.claude/agents/ and <path>/.opencode/agents/)

    unlink global           Remove global symlinks created by this script

    unlink project <path>   Remove project symlinks created by this script

    help                    Show this help message

Notes:
    - Claude Code symlinks directly from categories/ (no generation step needed)
    - OpenCode requires agent-specific/ to exist (run ./generate.sh first)
    - If agent-specific/ is missing, the OpenCode step is skipped with a warning
    - Cursor reads .claude/agents/ and ~/.claude/agents/ natively, so the Claude
      Code symlinks cover Cursor automatically with no extra step
    - Existing files and non-matching symlinks are never overwritten
    - Re-running is safe (already-linked entries are skipped)

Examples:
    $(basename "$0") global
    $(basename "$0") project ~/dev/my-project
    $(basename "$0") unlink project ~/dev/my-project
EOF
}

main() {
    local command="${1:-}"

    case "$command" in
        global)
            cmd_global
            ;;
        project)
            cmd_project "${2:-}"
            ;;
        unlink)
            local subcommand="${2:-}"
            case "$subcommand" in
                global)
                    cmd_unlink_global
                    ;;
                project)
                    cmd_unlink_project "${3:-}"
                    ;;
                *)
                    log_error "Unknown unlink target: $subcommand"
                    echo "Usage: $(basename "$0") unlink global|project [path]"
                    exit 1
                    ;;
            esac
            ;;
        help|--help|-h)
            usage
            ;;
        "")
            log_error "No command specified"
            usage
            exit 1
            ;;
        *)
            log_error "Unknown command: $command"
            usage
            exit 1
            ;;
    esac
}

main "$@"
