#!/usr/bin/env bash
#
# Agent Definition Generator
#
# Reads Claude Code subagent definitions from categories/ and generates
# equivalent definitions for OpenCode.
#
# Cursor reads .claude/agents/ natively, so no Cursor-specific generation
# is needed.
#
# Usage: ./generate.sh [command]
# Commands:
#   generate  Generate all agent definitions (default)
#   clean     Remove all generated files
#   list      List source agents with details
#   help      Show this help message

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$SCRIPT_DIR/categories"
OUTPUT_DIR="$SCRIPT_DIR/agent-specific"
OPENCODE_DIR="$OUTPUT_DIR/opencode"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC}  $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_debug() { [[ "${DEBUG:-}" == "1" ]] && echo -e "${BLUE}[DEBUG]${NC} $1" || true; }

DESCRIPTION=""
MODEL=""
TOOLS=""
BODY=""

parse_value() {
    local key="$1"
    local frontmatter="$2"
    echo "$frontmatter" | grep "^${key}:" | sed "s/^${key}: *//" | sed 's/^"//' | sed 's/"$//' | head -1 || true
}

parse_agent_file() {
    local file="$1"

    DESCRIPTION=""
    MODEL=""
    TOOLS=""
    BODY=""

    local content
    content=$(cat "$file")

    local in_frontmatter=false
    local frontmatter=""
    local body=""
    local found_first=false
    local found_second=false

    while IFS= read -r line; do
        if [[ "$line" == "---" ]]; then
            if [[ "$found_first" == false ]]; then
                found_first=true
                in_frontmatter=true
                continue
            else
                found_second=true
                in_frontmatter=false
                continue
            fi
        fi

        if [[ "$in_frontmatter" == true ]]; then
            frontmatter+="$line"$'\n'
        elif [[ "$found_second" == true ]]; then
            body+="$line"$'\n'
        fi
    done <<< "$content"

    DESCRIPTION=$(parse_value "description" "$frontmatter")
    MODEL=$(parse_value "model" "$frontmatter")
    TOOLS=$(parse_value "tools" "$frontmatter")
    BODY=$(echo "$body" | sed '/./,$!d')

    log_debug "Parsed: model=$MODEL tools=$TOOLS"
}

map_model_to_opencode() {
    local model="$1"
    case "$model" in
        sonnet) echo "anthropic/claude-sonnet-4-6" ;;
        opus)   echo "anthropic/claude-opus-4-6" ;;
        haiku)  echo "anthropic/claude-haiku-4-5" ;;
        *)      echo "anthropic/claude-sonnet-4-6" ;;
    esac
}

tools_contain() {
    local needle="$1"
    local haystack="$2"
    echo "$haystack" | grep -qi "$needle"
}

generate_opencode() {
    local source_file="$1"
    local output_file="$2"

    parse_agent_file "$source_file"

    local opencode_model
    opencode_model=$(map_model_to_opencode "$MODEL")

    local fm="---
description: $DESCRIPTION
mode: subagent
model: $opencode_model"

    local needs_tools_block=false
    local has_write=true has_edit=true has_bash=true

    if [[ -n "$TOOLS" ]]; then
        tools_contain "Write"  "$TOOLS" || has_write=false
        tools_contain "Edit"   "$TOOLS" || has_edit=false
        tools_contain "Bash"   "$TOOLS" || has_bash=false

        if [[ "$has_write" == false ]] || [[ "$has_edit" == false ]] || [[ "$has_bash" == false ]]; then
            needs_tools_block=true
        fi
    fi

    if [[ "$needs_tools_block" == true ]]; then
        fm+="
tools:"
        [[ "$has_write" == false ]] && fm+="
  write: false"
        [[ "$has_edit" == false ]] && fm+="
  edit: false"
        [[ "$has_bash" == false ]] && fm+="
  bash: false"
    fi

    fm+="
---"

    mkdir -p "$(dirname "$output_file")"
    printf '%s\n\n' "$fm" > "$output_file"
    printf '%s\n' "$BODY" >> "$output_file"
}

generate_all() {
    log_info "Generating agent definitions from source..."
    echo ""

    rm -rf "$OPENCODE_DIR"
    mkdir -p "$OPENCODE_DIR"

    local count=0

    while IFS= read -r -d '' source_file; do
        local basename
        basename=$(basename "$source_file")

        [[ "$basename" == "README.md" ]] && continue

        local rel_path="${source_file#"$SOURCE_DIR/"}"
        local rel_dir
        rel_dir=$(dirname "$rel_path")
        local agent_name="${basename%.md}"

        local opencode_out="$OPENCODE_DIR/$rel_dir/$agent_name.md"

        generate_opencode "$source_file" "$opencode_out"

        log_info "$agent_name"
        (( ++count ))
    done < <(find "$SOURCE_DIR" -name "*.md" -print0 | sort -z)

    echo ""
    log_info "Generated $count agents for OpenCode"
    echo ""
    log_info "Output location:"
    echo "  OpenCode: $OPENCODE_DIR"
    echo ""
    log_info "Run './setup.sh help' to link agents into your tools"
}

clean() {
    log_info "Cleaning generated files..."
    rm -rf "$OUTPUT_DIR"
    log_info "Removed $OUTPUT_DIR"
}

list_agents() {
    log_info "Source agents in $SOURCE_DIR:"
    echo ""
    printf "  %-40s %-8s %s\n" "NAME" "MODEL" "TOOLS"
    printf "  %-40s %-8s %s\n" "----" "-----" "-----"

    while IFS= read -r -d '' source_file; do
        [[ "$(basename "$source_file")" == "README.md" ]] && continue

        local rel_path="${source_file#"$SOURCE_DIR/"}"
        local label="${rel_path%.md}"

        parse_agent_file "$source_file"

        printf "  %-40s %-8s %s\n" "$label" "${MODEL:-sonnet}" "${TOOLS:-all}"
    done < <(find "$SOURCE_DIR" -name "*.md" -print0 | sort -z)
}

usage() {
    cat << EOF
Usage: $(basename "$0") [command]

Commands:
    generate    Generate agent definitions for OpenCode (default)
    clean       Remove all generated files in agent-specific/
    list        List source agents with model and tool details
    help        Show this help message

Environment:
    DEBUG=1     Enable debug output

Notes:
    Cursor reads .claude/agents/ and ~/.claude/agents/ natively, so the
    Claude Code definitions in categories/ work for Cursor without any
    generation step.

Examples:
    $(basename "$0")              Generate all agent definitions
    $(basename "$0") list         List all source agents
    $(basename "$0") clean        Remove generated output
    DEBUG=1 $(basename "$0")      Generate with debug logging
EOF
}

main() {
    local command="${1:-generate}"

    case "$command" in
        generate) generate_all ;;
        clean)    clean ;;
        list)     list_agents ;;
        help|--help|-h) usage ;;
        *)
            log_error "Unknown command: $command"
            usage
            exit 1
            ;;
    esac
}

main "$@"
