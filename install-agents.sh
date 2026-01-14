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
SOURCE_MODE=""  # "local" or "remote"

# GitHub API configuration
GITHUB_API_BASE="https://api.github.com/repos/VoltAgent/awesome-claude-code-subagents/contents"
GITHUB_RAW_BASE="https://raw.githubusercontent.com/VoltAgent/awesome-claude-code-subagents/main"

# Cache for remote data
REMOTE_CATEGORIES=()
REMOTE_AGENTS=()

# Function to check if local .claude directory exists
has_local_claude_dir() {
    [[ -d ".claude" ]]
}

# Function to check if local categories directory exists
has_local_categories() {
    [[ -d "$CATEGORIES_DIR" ]]
}

# Function to check if curl is available
check_curl() {
    if ! command -v curl &> /dev/null; then
        echo -e "${RED}Error: curl is required for remote mode but not installed.${NC}"
        exit 1
    fi
}

# Function to fetch categories from GitHub API
fetch_categories_remote() {
    local response
    response=$(curl -s "$GITHUB_API_BASE/categories")

    # Check for rate limiting or errors
    if echo "$response" | grep -q "API rate limit exceeded"; then
        echo -e "${RED}GitHub API rate limit exceeded. Please try again later or use local mode.${NC}"
        sleep 3
        return 1
    fi

    if echo "$response" | grep -q '"message"'; then
        echo -e "${RED}Error fetching from GitHub API.${NC}"
        sleep 3
        return 1
    fi

    # Parse JSON response - extract directory names starting with numbers
    REMOTE_CATEGORIES=()
    while IFS= read -r line; do
        if [[ -n "$line" ]]; then
            REMOTE_CATEGORIES+=("$line")
        fi
    done < <(echo "$response" | grep -o '"name": "[0-9][^"]*"' | sed 's/"name": "//;s/"$//' | sort)

    return 0
}

# Function to fetch agents from a category via GitHub API
fetch_agents_remote() {
    local category="$1"
    local response
    response=$(curl -s "$GITHUB_API_BASE/categories/$category")

    # Check for errors
    if echo "$response" | grep -q '"message"'; then
        return 1
    fi

    # Parse JSON response - extract .md files excluding README.md
    REMOTE_AGENTS=()
    while IFS= read -r line; do
        if [[ -n "$line" && "$line" != "README.md" ]]; then
            REMOTE_AGENTS+=("$line")
        fi
    done < <(echo "$response" | grep -o '"name": "[^"]*\.md"' | sed 's/"name": "//;s/"$//' | sort)

    return 0
}

# Function to download an agent file from GitHub
download_agent() {
    local category="$1"
    local agent_file="$2"
    local dest_path="$3"
    local url="$GITHUB_RAW_BASE/categories/$category/$agent_file"

    if curl -sS "$url" -o "$dest_path" 2>/dev/null; then
        return 0
    else
        return 1
    fi
}

# Function to select source mode (local or remote)
select_source_mode() {
    # If no local categories, automatically use remote
    if ! has_local_categories; then
        SOURCE_MODE="remote"
        check_curl
        echo -e "${YELLOW}No local repository found. Using remote mode (GitHub).${NC}"
        sleep 1
        return
    fi

    show_header
    echo -e "${BOLD}Select source:${NC}\n"

    echo -e "  ${YELLOW}1)${NC} Local files ${CYAN}(from cloned repository)${NC}"
    echo -e "     Faster, works offline"
    echo ""
    echo -e "  ${YELLOW}2)${NC} Remote ${CYAN}(download from GitHub)${NC}"
    echo -e "     Always up-to-date"
    echo ""
    echo -e "  ${YELLOW}q)${NC} Quit"
    echo ""

    read -p "Enter your choice: " choice

    case "$choice" in
        1)
            SOURCE_MODE="local"
            ;;
        2)
            SOURCE_MODE="remote"
            check_curl
            ;;
        q|Q)
            echo -e "\n${GREEN}Goodbye!${NC}"
            exit 0
            ;;
        *)
            echo -e "${RED}Invalid choice. Please try again.${NC}"
            sleep 1
            select_source_mode
            ;;
    esac
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
        local mode_str=""
        if [[ "$INSTALL_MODE" == "global" ]]; then
            mode_str="Global (~/.claude/agents/)"
        else
            mode_str="Local (.claude/agents/)"
        fi

        local source_str=""
        if [[ "$SOURCE_MODE" == "remote" ]]; then
            source_str=" | Source: GitHub"
        else
            source_str=" | Source: Local"
        fi

        echo -e "${BLUE}Mode: ${mode_str}${source_str}${NC}\n"
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

    if [[ "$SOURCE_MODE" == "remote" ]]; then
        # Remote mode: fetch from GitHub API
        echo -e "${CYAN}Fetching categories from GitHub...${NC}\n"
        if ! fetch_categories_remote; then
            echo -e "${RED}Failed to fetch categories. Press Enter to retry.${NC}"
            read
            select_category
            return
        fi

        for dirname in "${REMOTE_CATEGORIES[@]}"; do
            categories+=("$dirname")
            local display_name=$(get_category_name "$dirname")
            echo -e "  ${YELLOW}$i)${NC} $display_name"
            ((i++))
        done
    else
        # Local mode: read from filesystem
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
    fi

    echo ""
    echo -e "  ${YELLOW}q)${NC} Quit"
    echo ""

    read -p "Enter your choice: " choice

    if [[ "$choice" == "q" || "$choice" == "Q" ]]; then
        echo -e "\n${GREEN}Goodbye!${NC}"
        exit 0
    fi

    if [[ "$choice" =~ ^[0-9]+$ ]] && (( choice >= 1 && choice <= ${#categories[@]} )); then
        SELECTED_CATEGORY="${categories[$((choice-1))]}"
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
    local category_name=$(get_category_name "$category")

    # Build list of agents (excluding README.md)
    local agents=()
    local agent_states=()

    if [[ "$SOURCE_MODE" == "remote" ]]; then
        # Remote mode: fetch from GitHub API
        show_header
        echo -e "${BOLD}Category: ${CYAN}$category_name${NC}\n"
        echo -e "${CYAN}Fetching agents from GitHub...${NC}\n"

        if ! fetch_agents_remote "$category"; then
            echo -e "${RED}Failed to fetch agents. Press Enter to go back.${NC}"
            read
            return 1
        fi

        for agent_file in "${REMOTE_AGENTS[@]}"; do
            agents+=("$agent_file")
            # Check if installed (by filename)
            if [[ -f "$CLAUDE_AGENTS_DIR/$agent_file" ]]; then
                agent_states+=(1)
            else
                agent_states+=(0)
            fi
        done
    else
        # Local mode: read from filesystem
        local category_path="$CATEGORIES_DIR/$category"
        for agent_file in "$category_path"/*.md; do
            local basename=$(basename "$agent_file")
            if [[ "$basename" != "README.md" ]]; then
                agents+=("$basename")
                if [[ -f "$CLAUDE_AGENTS_DIR/$basename" ]]; then
                    agent_states+=(1)
                else
                    agent_states+=(0)
                fi
            fi
        done
    fi

    # Store original states to calculate changes
    local original_states=("${agent_states[@]}")

    while true; do
        show_header
        echo -e "${BOLD}Category: ${CYAN}$category_name${NC}\n"
        echo -e "Use number keys to toggle selection. ${GREEN}[✓]${NC} = will be installed, ${RED}[ ]${NC} = will be removed\n"

        local i=1
        for agent_file in "${agents[@]}"; do
            local agent_name="${agent_file%.md}"
            local is_installed=""
            local status_icon=""
            local status_color=""

            if [[ -f "$CLAUDE_AGENTS_DIR/$agent_file" ]]; then
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
                    local is_selected=${agent_states[$i]}

                    # Check if currently installed
                    local was_installed=0
                    if [[ -f "$CLAUDE_AGENTS_DIR/$agent_file" ]]; then
                        was_installed=1
                    fi

                    if [[ $was_installed -eq 0 && $is_selected -eq 1 ]]; then
                        to_install+=("$agent_file")
                    elif [[ $was_installed -eq 1 && $is_selected -eq 0 ]]; then
                        to_uninstall+=("$agent_file")
                    fi
                done

                confirm_and_apply "$category" "${to_install[*]}" "${to_uninstall[*]}"
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
    local category="$1"
    local install_list="$2"
    local uninstall_list="$3"

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
                echo -e "  ${GREEN}+${NC} ${agent_file%.md}"
            fi
        done
        echo ""
    fi

    if [[ $uninstall_count -gt 0 ]]; then
        echo -e "${RED}Agents to uninstall ($uninstall_count):${NC}"
        for agent_file in "${to_uninstall[@]}"; do
            if [[ -n "$agent_file" ]]; then
                echo -e "  ${RED}-${NC} ${agent_file%.md}"
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
            if [[ -n "$agent_file" ]]; then
                if [[ "$SOURCE_MODE" == "remote" ]]; then
                    # Download from GitHub
                    echo -e "${CYAN}Downloading $agent_file...${NC}"
                    if download_agent "$category" "$agent_file" "$CLAUDE_AGENTS_DIR/$agent_file"; then
                        echo -e "${GREEN}✓${NC} Installed: $agent_file"
                    else
                        echo -e "${RED}✗${NC} Failed to download: $agent_file"
                    fi
                else
                    # Copy from local
                    local source_path="$CATEGORIES_DIR/$category/$agent_file"
                    if [[ -f "$source_path" ]]; then
                        cp "$source_path" "$CLAUDE_AGENTS_DIR/$agent_file"
                        echo -e "${GREEN}✓${NC} Installed: $agent_file"
                    fi
                fi
            fi
        done

        # Perform uninstallations
        for agent_file in "${to_uninstall[@]}"; do
            if [[ -n "$agent_file" ]]; then
                if [[ -f "$CLAUDE_AGENTS_DIR/$agent_file" ]]; then
                    rm "$CLAUDE_AGENTS_DIR/$agent_file"
                    echo -e "${RED}✓${NC} Uninstalled: $agent_file"
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
    select_source_mode
    while true; do
        select_category
        while select_agents "$SELECTED_CATEGORY"; do
            :
        done
    done
}

# Run main function
main
