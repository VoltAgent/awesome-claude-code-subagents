#!/usr/bin/env bash

# Claude Code Agents Installer — arrow-key TUI

# No set -e: raw terminal mode + set -e can bypass the EXIT trap

# --- ANSI color constants ---
RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
CYAN=$'\033[0;36m'
BOLD=$'\033[1m'
DIM=$'\033[2m'
NC=$'\033[0m'

# --- Cursor control constants ---
CURSOR_HIDE=$'\033[?25l'
CURSOR_SHOW=$'\033[?25h'

# --- Path constants ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CATEGORIES_DIR="$SCRIPT_DIR/categories"
LOCAL_AGENTS_DIR=".claude/agents"

# --- Global state ---
declare -A SELECTED
MAIN_CURSOR=0
SUB_CURSOR=0
CATEGORIES=()
AGENTS_FOR_CAT=()
INSTALLED_FILES=()
TERM_MODIFIED=""

# ============================================================
# Task 2: Terminal management
# ============================================================

term_setup() {
    stty -echo -icanon min 1 time 0
    TERM_MODIFIED=1
    printf '%s' "$CURSOR_HIDE"
}

term_restore() {
    if [[ -n "$TERM_MODIFIED" ]]; then
        stty echo icanon
        TERM_MODIFIED=""
    fi
    printf '%s' "$CURSOR_SHOW"
}

trap_handler() {
    term_restore
    exit 0
}

trap trap_handler EXIT INT TERM

# ============================================================
# Task 3: read_key()
# ============================================================

read_key() {
    local byte seq1 seq2
    IFS= read -r -s -n1 byte || { KEY=EOF; return; }

    if [[ "$byte" == $'\033' ]]; then
        IFS= read -r -s -n1 -t 0.1 seq1 || true
        IFS= read -r -s -n1 -t 0.1 seq2 || true
        if [[ "$seq1" == "[" && "$seq2" == "A" ]]; then
            KEY=UP
        elif [[ "$seq1" == "[" && "$seq2" == "B" ]]; then
            KEY=DOWN
        else
            KEY=ESC
        fi
    elif [[ "$byte" == "" ]]; then
        KEY=ENTER
    elif [[ "$byte" == " " ]]; then
        KEY=SPACE
    else
        KEY="$byte"
    fi
}

# ============================================================
# Task 4: Data-loading functions
# ============================================================

load_categories() {
    CATEGORIES=()
    local dir
    for dir in "$CATEGORIES_DIR"/[0-9]*/; do
        if [[ -d "$dir" ]]; then
            CATEGORIES+=("$(basename "$dir")")
        fi
    done
}

load_agents() {
    local cat_idx="$1"
    AGENTS_FOR_CAT=()
    local f
    for f in "$CATEGORIES_DIR/${CATEGORIES[$cat_idx]}"/*.md; do
        if [[ -f "$f" ]]; then
            local base
            base="$(basename "$f")"
            if [[ "$base" != "README.md" ]]; then
                AGENTS_FOR_CAT+=("$base")
            fi
        fi
    done
}

get_display_name() {
    local dirname="$1"
    # Strip numeric prefix (e.g. "01-"), convert hyphens to spaces, title-case
    echo "$dirname" | sed 's/^[0-9]*-//' | tr '-' ' ' | \
        awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) tolower(substr($i,2)); print}'
}

count_selected() {
    local cat_idx="$1"
    local count=0
    local key
    for key in "${!SELECTED[@]}"; do
        if [[ "$key" == "${cat_idx}:"* && "${SELECTED[$key]}" == "1" ]]; then
            (( count++ )) || true
        fi
    done
    echo "$count"
}

count_all_selected() {
    local count=0
    local key
    for key in "${!SELECTED[@]}"; do
        if [[ "${SELECTED[$key]}" == "1" ]]; then
            (( count++ )) || true
        fi
    done
    echo "$count"
}

# ============================================================
# Task 5: render_main()
# ============================================================

render_main() {
    printf '\033[2J\033[H'
    printf '%s' "${BOLD}${CYAN}"
    printf '╔══════════════════════════════════════════════════════════════╗\n'
    printf '║           Claude Code Agents Installer                       ║\n'
    printf '╚══════════════════════════════════════════════════════════════╝\n'
    printf '%s\n' "${NC}"
    printf '%s\n' "Select a category:"
    printf '\n'

    local i
    for i in "${!CATEGORIES[@]}"; do
        local display
        display="$(get_display_name "${CATEGORIES[$i]}")"
        local sel_count
        sel_count="$(count_selected "$i")"

        if [[ "$i" == "$MAIN_CURSOR" ]]; then
            printf '%s' "${BOLD}> "
        else
            printf '  '
        fi

        printf '%s' "$display"

        if [[ "$sel_count" -gt 0 ]]; then
            printf ' %s(%s selected)%s' "${CYAN}" "$sel_count" "${NC}"
        fi

        if [[ "$i" == "$MAIN_CURSOR" ]]; then
            printf '%s' "${NC}"
        fi

        printf '\n'
    done

    printf '\n'
    local total
    total="$(count_all_selected)"
    printf '%s\n' "${DIM}Total: ${total} selected | Space: open  Enter: install  q: quit${NC}"
}

# ============================================================
# Task 6: render_sub()
# ============================================================

render_sub() {
    local cat_idx="$1"
    local cat_name
    cat_name="$(get_display_name "${CATEGORIES[$cat_idx]}")"

    printf '\033[2J\033[H'
    printf '%s' "${BOLD}${CYAN}"
    printf '╔══════════════════════════════════════════════════════════════╗\n'
    printf '║           Claude Code Agents Installer                       ║\n'
    printf '╚══════════════════════════════════════════════════════════════╝\n'
    printf '%s\n' "${NC}"
    printf 'Category: %s%s%s\n' "${BOLD}" "$cat_name" "${NC}"
    printf '\n'

    if [[ "${#AGENTS_FOR_CAT[@]}" -eq 0 ]]; then
        printf '%s\n' "${DIM}No agents in this category${NC}"
        printf '\n'
        printf '%s\n' "${DIM}b: back  q: quit${NC}"
        return
    fi

    local i
    for i in "${!AGENTS_FOR_CAT[@]}"; do
        local agent_name="${AGENTS_FOR_CAT[$i]%.md}"

        if [[ "$i" == "$SUB_CURSOR" ]]; then
            printf '%s' "${BOLD}> "
        else
            printf '  '
        fi

        # Checkbox
        if [[ "${SELECTED["${cat_idx}:${i}"]:-0}" == "1" ]]; then
            printf '%s[✓]%s' "${GREEN}" "${NC}"
        else
            printf '%s[ ]%s' "${DIM}" "${NC}"
        fi

        printf ' %s' "$agent_name"

        if [[ "$i" == "$SUB_CURSOR" ]]; then
            printf '%s' "${NC}"
        fi

        printf '\n'
    done

    printf '\n'
    printf '%s\n' "${DIM}Space: toggle  Enter: confirm  b: back  q: quit${NC}"
}

# ============================================================
# Task 7: init_selections()
# ============================================================

init_selections() {
    local cat_idx="$1"
    load_agents "$cat_idx"
    local i
    for i in "${!AGENTS_FOR_CAT[@]}"; do
        if [[ ! -v SELECTED["${cat_idx}:${i}"] ]]; then
            SELECTED["${cat_idx}:${i}"]=0
        fi
    done
}

# ============================================================
# Task 8: run_sub_menu()
# ============================================================

run_sub_menu() {
    local cat_idx="$1"
    init_selections "$cat_idx"

    # Snapshot current selections for this category
    declare -A snapshot
    local key
    for key in "${!SELECTED[@]}"; do
        if [[ "$key" == "${cat_idx}:"* ]]; then
            snapshot["$key"]="${SELECTED[$key]}"
        fi
    done

    SUB_CURSOR=0

    while true; do
        load_agents "$cat_idx"

        # Clamp cursor
        local agent_count="${#AGENTS_FOR_CAT[@]}"
        if [[ "$agent_count" -gt 0 && "$SUB_CURSOR" -ge "$agent_count" ]]; then
            SUB_CURSOR=$(( agent_count - 1 ))
        fi

        render_sub "$cat_idx"
        read_key

        case "$KEY" in
            UP)
                if [[ "$SUB_CURSOR" -gt 0 ]]; then
                    (( SUB_CURSOR-- )) || true
                fi
                ;;
            DOWN)
                if [[ "$agent_count" -gt 0 && "$SUB_CURSOR" -lt $(( agent_count - 1 )) ]]; then
                    (( SUB_CURSOR++ )) || true
                fi
                ;;
            SPACE)
                if [[ "$agent_count" -gt 0 ]]; then
                    local sel_key="${cat_idx}:${SUB_CURSOR}"
                    if [[ "${SELECTED[$sel_key]:-0}" == "1" ]]; then
                        SELECTED["$sel_key"]=0
                    else
                        SELECTED["$sel_key"]=1
                    fi
                fi
                ;;
            ENTER)
                return 0
                ;;
            b|B)
                # Restore snapshot
                for key in "${!snapshot[@]}"; do
                    SELECTED["$key"]="${snapshot[$key]}"
                done
                return 0
                ;;
            q|Q|EOF)
                term_restore
                exit 0
                ;;
        esac
    done
}

# ============================================================
# Task 9: run_main_menu()
# ============================================================

run_main_menu() {
    MAIN_CURSOR=0

    # Re-render immediately on window resize
    trap 'render_main' SIGWINCH

    while true; do
        render_main
        read_key

        local cat_count="${#CATEGORIES[@]}"

        case "$KEY" in
            UP)
                if [[ "$MAIN_CURSOR" -gt 0 ]]; then
                    (( MAIN_CURSOR-- )) || true
                fi
                ;;
            DOWN)
                if [[ "$MAIN_CURSOR" -lt $(( cat_count - 1 )) ]]; then
                    (( MAIN_CURSOR++ )) || true
                fi
                ;;
            SPACE)
                run_sub_menu "$MAIN_CURSOR"
                ;;
            ENTER)
                install_selected
                show_summary
                exit 0
                ;;
            q|Q|EOF)
                term_restore
                exit 0
                ;;
        esac
    done
}

# ============================================================
# Task 10: install_selected() + show_summary()
# ============================================================

install_selected() {
    mkdir -p "$LOCAL_AGENTS_DIR"
    INSTALLED_FILES=()

    local key
    local last_cat=""
    for key in "${!SELECTED[@]}"; do
        if [[ "${SELECTED[$key]}" == "1" ]]; then
            # Parse cat_idx and agent_idx from "cat_idx:agent_idx"
            local cat_idx="${key%%:*}"
            local agent_idx="${key##*:}"

            # Reload agents for this category to get filename (reload whenever category changes)
            if [[ "$cat_idx" != "$last_cat" ]]; then
                load_agents "$cat_idx"
                last_cat="$cat_idx"
            fi

            local agent_file="${AGENTS_FOR_CAT[$agent_idx]:-}"
            if [[ -z "$agent_file" ]]; then
                continue
            fi

            local src="$CATEGORIES_DIR/${CATEGORIES[$cat_idx]}/$agent_file"
            local dst="$LOCAL_AGENTS_DIR/$agent_file"

            if [[ -f "$src" ]] && cp "$src" "$dst"; then
                INSTALLED_FILES+=("$dst")
            fi
        fi
    done
}

show_summary() {
    term_restore
    printf '\n'
    if [[ "${#INSTALLED_FILES[@]}" -eq 0 ]]; then
        printf '%s\n' "No agents selected — nothing installed."
        return
    fi
    printf '%s\n' "Installed agents:"
    local f
    for f in "${INSTALLED_FILES[@]}"; do
        printf '  %s+%s %s\n' "${GREEN}" "${NC}" "$f"
    done
    printf '\n'
    printf '%sInstalled %d agent(s) to %s%s\n' \
        "${BOLD}" "${#INSTALLED_FILES[@]}" "$LOCAL_AGENTS_DIR" "${NC}"
}

# ============================================================
# Task 11: main() entrypoint
# ============================================================

usage() {
    printf 'Usage: %s [--all] [--install-dir local|global]\n' "$0" >&2
}

install_all() {
    load_categories
    if [[ "${#CATEGORIES[@]}" -eq 0 ]]; then
        printf '%sError: No categories found in %s%s\n' "${RED}" "$CATEGORIES_DIR" "${NC}" >&2
        exit 1
    fi

    local cat_idx
    for cat_idx in "${!CATEGORIES[@]}"; do
        load_agents "$cat_idx"
        local agent_idx
        for agent_idx in "${!AGENTS_FOR_CAT[@]}"; do
            SELECTED["${cat_idx}:${agent_idx}"]=1
        done
    done

    install_selected
    show_summary
}

main() {
    if (( BASH_VERSINFO[0] < 4 || (BASH_VERSINFO[0] == 4 && BASH_VERSINFO[1] < 2) )); then
        printf 'Error: bash 4.2+ required (current: %s)\n' "$BASH_VERSION" >&2
        exit 1
    fi

    local do_all=0

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --install-dir)
                case "${2:-}" in
                    local)  LOCAL_AGENTS_DIR=".claude/agents" ;;
                    global) LOCAL_AGENTS_DIR="$HOME/.claude/agents" ;;
                    *)
                        usage; exit 1
                        ;;
                esac
                shift 2
                ;;
            --all)
                do_all=1
                shift
                ;;
            *)
                usage; exit 1
                ;;
        esac
    done

    if [[ "$do_all" -eq 1 ]]; then
        install_all
        return
    fi

    term_setup

    load_categories

    if [[ "${#CATEGORIES[@]}" -eq 0 ]]; then
        term_restore
        printf '%sError: No categories found in %s%s\n' "${RED}" "$CATEGORIES_DIR" "${NC}" >&2
        exit 1
    fi

    run_main_menu
}

main "$@"
