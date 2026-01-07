#!/bin/bash

# Claude Code Agents Installer
# Interactive script to install/uninstall agents from this repository

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CATEGORIES_DIR="$SCRIPT_DIR/categories"
GLOBAL_AGENTS_DIR="$HOME/.claude/agents"
LOCAL_AGENTS_DIR=".claude/agents"
CLAUDE_AGENTS_DIR=""  # Will be set by select_install_mode
INSTALL_MODE=""  # "global" or "local"

# Function to check if local .claude directory exists
has_local_claude_dir() {
    [[ -d ".claude" ]]
}

# Function to select installation mode
select_install_mode() {
    show_header
    echo -e "${BOLD}Select installation mode:${NC}\n"

    echo -e "  ${YELLOW}1)${NC} Global installation ${CYAN}(~/.claude/agents/)${NC}"
    echo -e "     Available for all projects"
    echo ""

    if has_local_claude_dir; then
        echo -e "  ${YELLOW}2)${NC} Local installation ${CYAN}(.claude/agents/)${NC}"
        echo -e "     Only for current project"
    else
        echo -e "  ${BLUE}2)${NC} Local installation ${CYAN}(not available)${NC}"
        echo -e "     ${YELLOW}No .claude/ directory found in current directory${NC}"
    fi
    echo ""
    echo -e "  ${YELLOW}q)${NC} Quit"
    echo ""

    read -p "Enter your choice: " choice

    case "$choice" in
        1)
            CLAUDE_AGENTS_DIR="$GLOBAL_AGENTS_DIR"
            INSTALL_MODE="global"
            mkdir -p "$CLAUDE_AGENTS_DIR"
            ;;
        2)
            if has_local_claude_dir; then
                CLAUDE_AGENTS_DIR="$LOCAL_AGENTS_DIR"
                INSTALL_MODE="local"
                mkdir -p "$CLAUDE_AGENTS_DIR"
            else
                echo -e "\n${RED}Local installation not available. No .claude/ directory found.${NC}"
                sleep 2
                select_install_mode
                return
            fi
            ;;
        q|Q)
            echo -e "\n${GREEN}Goodbye!${NC}"
            exit 0
            ;;
        *)
            echo -e "${RED}Invalid choice. Please try again.${NC}"
            sleep 1
            select_install_mode
            ;;
    esac
}

# Function to display a header
show_header() {
    clear
    echo -e "${BOLD}${CYAN}"
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║           Claude Code Agents Installer                       ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    if [[ -n "$INSTALL_MODE" ]]; then
        if [[ "$INSTALL_MODE" == "global" ]]; then
            echo -e "${BLUE}Mode: Global (~/.claude/agents/)${NC}\n"
        else
            echo -e "${BLUE}Mode: Local (.claude/agents/)${NC}\n"
        fi
    fi
}

# Function to get category display name (remove number prefix)
# Uses awk for Title Case conversion (compatible with macOS and Linux)
get_category_name() {
    local dir="$1"
    echo "$dir" | sed 's/^[0-9]*-//' | tr '-' ' ' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) tolower(substr($i,2))}1'
}

# Function to check if an agent is installed
is_agent_installed() {
    local agent_file="$1"
    local agent_name=$(basename "$agent_file")
    [[ -f "$CLAUDE_AGENTS_DIR/$agent_name" ]]
}

# Function to get agent description from frontmatter
get_agent_description() {
    local agent_file="$1"
    grep -A1 "^description:" "$agent_file" 2>/dev/null | head -1 | sed 's/^description: *//' | cut -c1-60
}

# Function to display category selection menu
select_category() {
    show_header
    echo -e "${BOLD}Select a category:${NC}\n"

    local categories=()
    local i=1

    for dir in "$CATEGORIES_DIR"/*/; do
        if [[ -d "$dir" && $(basename "$dir") != "." ]]; then
            local dirname=$(basename "$dir")
            # Skip if it's not a category directory (doesn't start with number)
            if [[ "$dirname" =~ ^[0-9]+ ]]; then
                categories+=("$dirname")
                local display_name=$(get_category_name "$dirname")
                local agent_count=$(ls "$dir"/*.md 2>/dev/null | grep -v README.md | wc -l | tr -d ' ')
                echo -e "  ${YELLOW}$i)${NC} $display_name ${CYAN}($agent_count agents)${NC}"
                ((i++))
            fi
        fi
    done

    echo ""
    echo -e "  ${YELLOW}q)${NC} Quit"
    echo ""

    read -p "Enter your choice: " choice

    if [[ "$choice" == "q" || "$choice" == "Q" ]]; then
        echo -e "\n${GREEN}Goodbye!${NC}"
        exit 0
    fi

    if [[ "$choice" =~ ^[0-9]+$ ]] && (( choice >= 1 && choice <= ${#categories[@]} )); then
        SELECTED_CATEGORY="$CATEGORIES_DIR/${categories[$((choice-1))]}"
        return 0
    else
        echo -e "${RED}Invalid choice. Please try again.${NC}"
        sleep 1
        select_category
    fi
}

# Function to display agent selection menu with multi-select
select_agents() {
    local category="$1"
    local category_path="$category"
    local category_name=$(get_category_name "$(basename "$category")")

    # Build list of agents (excluding README.md)
    local agents=()
    local agent_states=()

    for agent_file in "$category_path"/*.md; do
        local basename=$(basename "$agent_file")
        if [[ "$basename" != "README.md" ]]; then
            agents+=("$agent_file")
            if is_agent_installed "$agent_file"; then
                agent_states+=(1)  # 1 = selected/installed
            else
                agent_states+=(0)  # 0 = not selected
            fi
        fi
    done

    # Store original states to calculate changes
    local original_states=("${agent_states[@]}")

    while true; do
        show_header
        echo -e "${BOLD}Category: ${CYAN}$category_name${NC}\n"
        echo -e "Use number keys to toggle selection. ${GREEN}[✓]${NC} = will be installed, ${RED}[ ]${NC} = will be removed\n"

        local i=1
        for agent_file in "${agents[@]}"; do
            local agent_name=$(basename "$agent_file" .md)
            local is_installed=""
            local status_icon=""
            local status_color=""

            if is_agent_installed "$agent_file"; then
                is_installed=" ${BLUE}(installed)${NC}"
            fi

            if [[ ${agent_states[$((i-1))]} -eq 1 ]]; then
                status_icon="[✓]"
                status_color="${GREEN}"
            else
                status_icon="[ ]"
                status_color="${RED}"
            fi

            echo -e "  ${YELLOW}$i)${NC} ${status_color}${status_icon}${NC} $agent_name$is_installed"
            ((i++))
        done

        echo ""
        echo -e "  ${YELLOW}a)${NC} Select all"
        echo -e "  ${YELLOW}n)${NC} Deselect all"
        echo -e "  ${YELLOW}c)${NC} Confirm selection"
        echo -e "  ${YELLOW}b)${NC} Back to categories"
        echo -e "  ${YELLOW}q)${NC} Quit"
        echo ""

        read -p "Enter your choice: " choice

        case "$choice" in
            [0-9]*)
                if (( choice >= 1 && choice <= ${#agents[@]} )); then
                    # Toggle selection
                    local idx=$((choice-1))
                    if [[ ${agent_states[$idx]} -eq 1 ]]; then
                        agent_states[$idx]=0
                    else
                        agent_states[$idx]=1
                    fi
                fi
                ;;
            a|A)
                for i in "${!agent_states[@]}"; do
                    agent_states[$i]=1
                done
                ;;
            n|N)
                for i in "${!agent_states[@]}"; do
                    agent_states[$i]=0
                done
                ;;
            c|C)
                # Calculate changes
                local to_install=()
                local to_uninstall=()

                for i in "${!agents[@]}"; do
                    local agent_file="${agents[$i]}"
                    local was_installed=${original_states[$i]}
                    local is_selected=${agent_states[$i]}

                    # Check if currently installed (not original state)
                    if is_agent_installed "$agent_file"; then
                        was_installed=1
                    else
                        was_installed=0
                    fi

                    if [[ $was_installed -eq 0 && $is_selected -eq 1 ]]; then
                        to_install+=("$agent_file")
                    elif [[ $was_installed -eq 1 && $is_selected -eq 0 ]]; then
                        to_uninstall+=("$agent_file")
                    fi
                done

                confirm_and_apply "${to_install[*]}" "${to_uninstall[*]}"
                return
                ;;
            b|B)
                return 1
                ;;
            q|Q)
                echo -e "\n${GREEN}Goodbye!${NC}"
                exit 0
                ;;
        esac
    done
}

# Function to confirm and apply changes
confirm_and_apply() {
    local install_list="$1"
    local uninstall_list="$2"

    # Convert space-separated strings back to arrays
    IFS=' ' read -ra to_install <<< "$install_list"
    IFS=' ' read -ra to_uninstall <<< "$uninstall_list"

    # Filter out empty entries
    local install_count=0
    local uninstall_count=0

    for item in "${to_install[@]}"; do
        [[ -n "$item" ]] && ((install_count++))
    done

    for item in "${to_uninstall[@]}"; do
        [[ -n "$item" ]] && ((uninstall_count++))
    done

    show_header
    echo -e "${BOLD}Confirmation${NC}\n"

    if [[ $install_count -eq 0 && $uninstall_count -eq 0 ]]; then
        echo -e "${YELLOW}No changes to apply.${NC}"
        echo ""
        read -p "Press Enter to continue..."
        return
    fi

    if [[ $install_count -gt 0 ]]; then
        echo -e "${GREEN}Agents to install ($install_count):${NC}"
        for agent_file in "${to_install[@]}"; do
            if [[ -n "$agent_file" ]]; then
                echo -e "  ${GREEN}+${NC} $(basename "$agent_file" .md)"
            fi
        done
        echo ""
    fi

    if [[ $uninstall_count -gt 0 ]]; then
        echo -e "${RED}Agents to uninstall ($uninstall_count):${NC}"
        for agent_file in "${to_uninstall[@]}"; do
            if [[ -n "$agent_file" ]]; then
                echo -e "  ${RED}-${NC} $(basename "$agent_file" .md)"
            fi
        done
        echo ""
    fi

    echo -e "${BOLD}Summary:${NC} ${GREEN}$install_count to install${NC}, ${RED}$uninstall_count to uninstall${NC}"
    echo ""

    read -p "Apply these changes? (y/N): " confirm

    if [[ "$confirm" == "y" || "$confirm" == "Y" ]]; then
        echo ""

        # Perform installations
        for agent_file in "${to_install[@]}"; do
            if [[ -n "$agent_file" && -f "$agent_file" ]]; then
                local agent_name=$(basename "$agent_file")
                cp "$agent_file" "$CLAUDE_AGENTS_DIR/$agent_name"
                echo -e "${GREEN}✓${NC} Installed: $agent_name"
            fi
        done

        # Perform uninstallations
        for agent_file in "${to_uninstall[@]}"; do
            if [[ -n "$agent_file" ]]; then
                local agent_name=$(basename "$agent_file")
                if [[ -f "$CLAUDE_AGENTS_DIR/$agent_name" ]]; then
                    rm "$CLAUDE_AGENTS_DIR/$agent_name"
                    echo -e "${RED}✓${NC} Uninstalled: $agent_name"
                fi
            fi
        done

        echo ""
        echo -e "${GREEN}${BOLD}Changes applied successfully!${NC}"
    else
        echo -e "${YELLOW}Changes cancelled.${NC}"
    fi

    echo ""
    read -p "Press Enter to continue..."
}

# Main loop
main() {
    select_install_mode
    while true; do
        select_category
        while select_agents "$SELECTED_CATEGORY"; do
            :
        done
    done
}

# Run main function
main
