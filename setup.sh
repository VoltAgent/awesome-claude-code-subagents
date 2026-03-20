#!/usr/bin/env bash
#
# Agent Symlink Setup
#
# Creates or removes symlinks from Claude Code, OpenCode, and Cursor config
# directories to the agent definitions in this repository.
#
# Requires bash 4+ (for associative arrays). macOS ships bash 3.2 by default;
# install a newer version via Homebrew: brew install bash
#
# Claude Code symlinks directly from categories/ (no generation needed).
# OpenCode symlinks from agent-specific/opencode/ (run generate.sh first).
# Cursor symlinks from agent-specific/cursor/ (run generate.sh first).
#
# Usage: ./setup.sh <command> [options]
# Commands:
#   global                  Symlink into global config (interactive tool selection)
#   project <path>          Symlink into a project's local config
#   unlink global           Remove global symlinks created by this script
#   unlink project <path>   Remove project symlinks created by this script
#   help                    Show this help message

set -euo pipefail

if (( BASH_VERSINFO[0] < 4 )); then
    echo "Error: bash 4+ is required. You have bash ${BASH_VERSION}." >&2
    echo "On macOS, install a newer bash via Homebrew: brew install bash" >&2
    exit 1
fi

# ---------------------------------------------------------------------------
# Base paths
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CATEGORIES_DIR="$SCRIPT_DIR/categories"
OUTPUT_DIR="$SCRIPT_DIR/agent-specific"

# ---------------------------------------------------------------------------
# Tool registry
#
# To add a new tool:
#   1. Append its key to TOOL_KEYS (controls checkbox display order)
#   2. Add a block of five entries to TOOLS below, keyed as "<key>:<property>"
#
# No changes to any function are needed.
# ---------------------------------------------------------------------------

TOOL_KEYS=( claude opencode cursor )
SYMLINK_NAME="awesome-subagents"

declare -A TOOLS=(
    [claude:label]="Claude Code"
    [claude:source]="$CATEGORIES_DIR"
    [claude:global_target]="$HOME/.claude/agents"
    [claude:project_dir]=".claude/agents"
    [claude:needs_generate]=false

    [opencode:label]="OpenCode"
    [opencode:source]="$OUTPUT_DIR/opencode"
    [opencode:global_target]="${XDG_CONFIG_HOME:-$HOME/.config}/opencode/agents"
    [opencode:project_dir]=".opencode/agents"
    [opencode:needs_generate]=true

    [cursor:label]="Cursor"
    [cursor:source]="$OUTPUT_DIR/cursor"
    [cursor:global_target]="$HOME/.cursor/agents"
    [cursor:project_dir]=".cursor/agents"
    [cursor:needs_generate]=true
)

# ---------------------------------------------------------------------------
# Colours
# ---------------------------------------------------------------------------

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ---------------------------------------------------------------------------
# Logging helpers
# ---------------------------------------------------------------------------

log_info()   { echo -e "${GREEN}[INFO]${NC}  $1"; }
log_warn()   { echo -e "${YELLOW}[WARN]${NC}  $1"; }
log_error()  { echo -e "${RED}[ERROR]${NC} $1"; }
log_skip()   { echo -e "${CYAN}[SKIP]${NC}  $1"; }
log_unlink() { echo -e "${RED}[UNLINK]${NC} $1"; }

# ---------------------------------------------------------------------------
# check_generated <source_dir> <label>
# Returns 1 (with a warning) if the generated output directory is missing.
# ---------------------------------------------------------------------------

check_generated() {
    local dir="$1"
    local label="$2"
    if [[ ! -d "$dir" ]] || [[ -z "$(ls -A "$dir" 2>/dev/null)" ]]; then
        log_warn "$label: agent-specific/ not found or empty. Run ./generate.sh first."
        log_warn "Skipping $label setup."
        return 1
    fi
    return 0
}

# ---------------------------------------------------------------------------
# build_tool_options <mode> <return_var>
#
# Builds display strings for the checkbox UI from the tool registry.
# <mode> is "global" or "project".
# Stores the resulting array in <return_var>.
# ---------------------------------------------------------------------------

build_tool_options() {
    local mode="$1"
    local _return_var="$2"
    local _opts=()

    for key in "${TOOL_KEYS[@]}"; do
        local label="${TOOLS[$key:label]}"
        if [[ "$mode" == "global" ]]; then
            local target="${TOOLS[$key:global_target]}"
            local display="${target/#$HOME/\~}"
            _opts+=( "$label ($display/$SYMLINK_NAME/)" )
        else
            _opts+=( "$label (${TOOLS[$key:project_dir]}/$SYMLINK_NAME/)" )
        fi
    done

    eval "$_return_var"='("${_opts[@]}")'
}

# ---------------------------------------------------------------------------
# select_tools <return_var> <option1> [option2] ...
#
# Interactive checkbox UI. Renders on /dev/tty so output is never captured
# by callers. Stores the selected indices (0-based) in <return_var>.
# Returns 1 if no options are selected.
# ---------------------------------------------------------------------------

select_tools() {
    local _return_var="$1"
    shift
    local options=("$@")
    local count=${#options[@]}
    local selected=()
    local cursor_pos=0

    for (( i=0; i<count; i++ )); do
        selected+=( false )
    done

    render() {
        for (( i=0; i<count; i++ )); do
            local mark="[ ]"
            [[ "${selected[$i]}" == "true" ]] && mark="[x]"
            if [[ $i -eq $cursor_pos ]]; then
                printf "  ${BOLD}> $mark %s${NC}\n" "${options[$i]}"
            else
                printf "    $mark %s\n" "${options[$i]}"
            fi
        done
        printf "\n"
        printf "  Space: toggle   Enter: confirm   q/Ctrl-C: abort\n"
    } >/dev/tty

    tput civis >/dev/tty 2>/dev/null || true

    cleanup_tty() {
        tput cnorm >/dev/tty 2>/dev/null || true
        printf "\n" >/dev/tty
    }
    trap cleanup_tty EXIT INT TERM

    render

    while true; do
        local move_up=$(( count + 2 ))
        tput cuu "$move_up" >/dev/tty 2>/dev/null || true

        render

        local key
        IFS= read -rsn1 key </dev/tty 2>/dev/null || true

        case "$key" in
            $'\x1b')
                local seq1 seq2
                IFS= read -rsn1 -t 0.1 seq1 </dev/tty 2>/dev/null || seq1=""
                IFS= read -rsn1 -t 0.1 seq2 </dev/tty 2>/dev/null || seq2=""
                if [[ "$seq1" == "[" ]]; then
                    case "$seq2" in
                        A) (( cursor_pos > 0 )) && (( cursor_pos-- )) || true ;;
                        B) (( cursor_pos < count - 1 )) && (( cursor_pos++ )) || true ;;
                    esac
                fi
                ;;
            " ")
                if [[ "${selected[$cursor_pos]}" == "true" ]]; then
                    selected[$cursor_pos]=false
                else
                    selected[$cursor_pos]=true
                fi
                ;;
            $'\r'|$'\n'|"")
                break
                ;;
            "q"|$'\x03')
                tput cnorm >/dev/tty 2>/dev/null || true
                printf "\n\n" >/dev/tty
                log_error "Aborted."
                exit 1
                ;;
            "j")
                (( cursor_pos < count - 1 )) && (( cursor_pos++ )) || true
                ;;
            "k")
                (( cursor_pos > 0 )) && (( cursor_pos-- )) || true
                ;;
        esac
    done

    tput cnorm >/dev/tty 2>/dev/null || true
    trap - EXIT INT TERM

    printf "\n" >/dev/tty

    local _result=()
    for (( i=0; i<count; i++ )); do
        [[ "${selected[$i]}" == "true" ]] && _result+=( "$i" )
    done

    if [[ ${#_result[@]} -eq 0 ]]; then
        log_error "No tools selected. Nothing to do."
        return 1
    fi

    eval "$_return_var"='("${_result[@]}")'
}

# ---------------------------------------------------------------------------
# link_source_dir <source> <target_base> <label>
#
# Creates a single symlink: <target_base>/awesome-subagents -> <source>
# ---------------------------------------------------------------------------

link_source_dir() {
    local source="$1"
    local target_base="$2"
    local label="$3"

    mkdir -p "$target_base"

    local abs_source
    abs_source="$(cd "$source" && pwd)"
    local target="$target_base/$SYMLINK_NAME"

    if [[ -L "$target" ]]; then
        local existing_dest
        existing_dest=$(readlink "$target")
        if [[ "$existing_dest" == "$abs_source" ]]; then
            log_skip "$label: $SYMLINK_NAME/ (already linked)"
            echo "  $label: 0 linked, 1 skipped"
            return
        else
            log_warn "$label: $SYMLINK_NAME/ -> symlink exists pointing elsewhere, skipping"
            log_warn "  existing: $existing_dest"
            log_warn "  wanted:   $abs_source"
            echo "  $label: 0 linked, 1 skipped"
            return
        fi
    elif [[ -e "$target" ]]; then
        log_warn "$label: $SYMLINK_NAME/ -> path exists and is not a symlink, skipping"
        log_warn "  path: $target"
        echo "  $label: 0 linked, 1 skipped"
        return
    fi

    ln -s "$abs_source" "$target"
    log_info "$label: $SYMLINK_NAME/ -> $target"
    echo "  $label: 1 linked, 0 skipped"
}

# ---------------------------------------------------------------------------
# unlink_source_dir <source> <target_base> <label>
# ---------------------------------------------------------------------------

unlink_source_dir() {
    local source="$1"
    local target_base="$2"
    local label="$3"

    [[ -d "$target_base" ]] || return 0

    local abs_source
    abs_source="$(cd "$source" && pwd)"
    local target="$target_base/$SYMLINK_NAME"

    if [[ -L "$target" ]]; then
        local existing_dest
        existing_dest=$(readlink "$target")
        if [[ "$existing_dest" == "$abs_source" ]]; then
            rm "$target"
            log_unlink "$label: $SYMLINK_NAME/"
            echo "  $label: 1 symlink removed"
        else
            log_skip "$label: $SYMLINK_NAME/ (symlink points elsewhere, leaving untouched)"
            echo "  $label: 0 symlinks removed"
        fi
    else
        log_skip "$label: $SYMLINK_NAME/ (not found)"
        echo "  $label: 0 symlinks removed"
    fi
}

# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

cmd_global() {
    echo ""
    echo -e "${BOLD}Select tools to set up globally:${NC}"
    echo ""

    local tool_options=()
    build_tool_options global tool_options
    local chosen=()
    select_tools chosen "${tool_options[@]}"

    for idx in "${chosen[@]}"; do
        local key="${TOOL_KEYS[$idx]}"
        local label="${TOOLS[$key:label]}"
        local source="${TOOLS[$key:source]}"
        local target="${TOOLS[$key:global_target]}"

        if [[ "${TOOLS[$key:needs_generate]}" == true ]]; then
            check_generated "$source" "$label" || continue
        fi

        echo ""
        echo -e "${BOLD}$label - Global${NC}"
        echo "  Target: $target/$SYMLINK_NAME/"
        echo ""
        link_source_dir "$source" "$target" "$label"
    done

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
    echo -e "${BOLD}Select tools to set up in $abs_project:${NC}"
    echo ""

    local tool_options=()
    build_tool_options project tool_options
    local chosen=()
    select_tools chosen "${tool_options[@]}"

    for idx in "${chosen[@]}"; do
        local key="${TOOL_KEYS[$idx]}"
        local label="${TOOLS[$key:label]}"
        local source="${TOOLS[$key:source]}"
        local target="$abs_project/${TOOLS[$key:project_dir]}"

        if [[ "${TOOLS[$key:needs_generate]}" == true ]]; then
            check_generated "$source" "$label" || continue
        fi

        echo ""
        echo -e "${BOLD}$label - Project${NC}"
        echo "  Target: $target/$SYMLINK_NAME/"
        echo ""
        link_source_dir "$source" "$target" "$label"
    done

    echo ""
    log_info "Done. Selected agents are now available in $abs_project"
    echo ""
}

cmd_unlink_global() {
    echo ""
    echo -e "${BOLD}Select tools to unlink globally:${NC}"
    echo ""

    local tool_options=()
    build_tool_options global tool_options
    local chosen=()
    select_tools chosen "${tool_options[@]}"

    for idx in "${chosen[@]}"; do
        local key="${TOOL_KEYS[$idx]}"
        local label="${TOOLS[$key:label]}"
        local source="${TOOLS[$key:source]}"
        local target="${TOOLS[$key:global_target]}"

        echo ""
        echo -e "${BOLD}Removing global $label symlink${NC}"
        echo ""
        unlink_source_dir "$source" "$target" "$label"
    done

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
    echo -e "${BOLD}Select tools to unlink from $abs_project:${NC}"
    echo ""

    local tool_options=()
    build_tool_options project tool_options
    local chosen=()
    select_tools chosen "${tool_options[@]}"

    for idx in "${chosen[@]}"; do
        local key="${TOOL_KEYS[$idx]}"
        local label="${TOOLS[$key:label]}"
        local source="${TOOLS[$key:source]}"
        local target="$abs_project/${TOOLS[$key:project_dir]}"

        echo ""
        echo -e "${BOLD}Removing $label symlink from $abs_project${NC}"
        echo ""
        unlink_source_dir "$source" "$target" "$label"
    done

    echo ""
}

# ---------------------------------------------------------------------------
# Usage / main
# ---------------------------------------------------------------------------

usage() {
    cat << EOF
Usage: $(basename "$0") <command> [options]

Requires bash 4+. macOS ships bash 3.2; install via Homebrew: brew install bash

Commands:
    global                  Symlink agents into global config directories.
                            Presents an interactive tool selector - use Space
                            to toggle Claude Code, OpenCode, and/or Cursor,
                            then Enter to confirm.

    project <path>          Symlink agents into a project's local config.
                            Same interactive selector as global.

    unlink global           Remove global symlinks created by this script.
                            Interactive selector to choose which tools to unlink.

    unlink project <path>   Remove project symlinks created by this script.
                            Interactive selector to choose which tools to unlink.

    help                    Show this help message

Interactive selector keys:
    Up/Down or k/j          Move cursor
    Space                   Toggle selection
    Enter                   Confirm and proceed
    q or Ctrl-C             Abort

Notes:
    - Each tool gets a single symlink named awesome-subagents/ inside its agents dir
    - Claude Code: ~/.claude/agents/awesome-subagents -> categories/
    - OpenCode:    ~/.config/opencode/agents/awesome-subagents -> agent-specific/opencode/
    - Cursor:      ~/.cursor/agents/awesome-subagents -> agent-specific/cursor/
    - Claude Code symlinks directly from categories/ (no generation step needed)
    - OpenCode and Cursor require agent-specific/ to exist (run ./generate.sh first)
    - If agent-specific/ is missing, the affected tool step is skipped with a warning
    - Cursor definitions include readonly: true for agents without write/edit/bash tools
    - Existing files and non-matching symlinks are never overwritten
    - Re-running is safe (already-linked entries are skipped)

Examples:
    $(basename "$0") global
    $(basename "$0") project ~/dev/my-project
    $(basename "$0") unlink global
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
