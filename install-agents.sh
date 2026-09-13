#!/bin/bash

# Subagents Installer for ZCode & OpenCode
# Interactive script to install/uninstall agents from this repository

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CATEGORIES_DIR="$SCRIPT_DIR/categories"

# Default directories
ZCODE_GLOBAL_DIR="$HOME/.zcode/agents"
ZCODE_LOCAL_DIR=".zcode/agents"
OPENCODE_GLOBAL_DIR="$HOME/.config/opencode/agents"
OPENCODE_LOCAL_DIR=".opencode/agents"

TARGET_PLATFORM="zcode" # "zcode" or "opencode"
TARGET_AGENTS_DIR=""    # Will be set by select_install_mode
INSTALL_MODE=""         # "global" or "local"
SOURCE_MODE=""          # "local" or "remote"

# GitHub API configuration
GITHUB_API_BASE="https://api.github.com/repos/a2mus/awesome-zcode-subagents/contents"
GITHUB_RAW_BASE="https://raw.githubusercontent.com/a2mus/awesome-zcode-subagents/main"

# Cache for remote data
REMOTE_CATEGORIES=()
REMOTE_AGENTS=()

# Parse CLI arguments
for arg in "$@"; do
    case "$arg" in
        --opencode|-o)
            TARGET_PLATFORM="opencode"
            ;;
        --zcode|-z)
            TARGET_PLATFORM="zcode"
            ;;
        --global)
            INSTALL_MODE="global"
            ;;
        --local|-p|--project)
            INSTALL_MODE="local"
            ;;
        --help|-h)
            echo "Usage: ./install-agents.sh [options]"
            echo "Options:"
            echo "  --opencode, -o    Target OpenCode (~/.config/opencode/agents/ or .opencode/agents/)"
            echo "  --zcode, -z       Target ZCode (~/.zcode/agents/ or .zcode/agents/)"
            echo "  --global          Install to user global directory"
            echo "  --local, -p       Install to project local directory"
            echo "  --help, -h        Show this help message"
            exit 0
            ;;
    esac
done

has_local_zcode_dir() {
    [[ -d ".zcode" ]]
}

has_local_opencode_dir() {
    [[ -d ".opencode" ]]
}

has_local_categories() {
    [[ -d "$CATEGORIES_DIR" ]]
}

check_curl() {
    if ! command -v curl &> /dev/null; then
        echo -e "${RED}Error: curl is required for remote mode but not installed.${NC}"
        exit 1
    fi
}

fetch_categories_remote() {
    local response
    response=$(curl -s "$GITHUB_API_BASE/categories")

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

    REMOTE_CATEGORIES=()
    while IFS= read -r line; do
        if [[ -n "$line" ]]; then
            REMOTE_CATEGORIES+=("$line")
        fi
    done < <(echo "$response" | grep -o '"name": "[0-9][^"]*"' | sed 's/"name": "//;s/"$//' | sort)

    return 0
}

fetch_agents_remote() {
    local category="$1"
    local response
    response=$(curl -s "$GITHUB_API_BASE/categories/$category")

    if echo "$response" | grep -q '"message"'; then
        return 1
    fi

    REMOTE_AGENTS=()
    while IFS= read -r line; do
        if [[ -n "$line" && "$line" != "README.md" ]]; then
            REMOTE_AGENTS+=("$line")
        fi
    done < <(echo "$response" | grep -o '"name": "[^"]*\.md"' | sed 's/"name": "//;s/"$//' | sort)

    return 0
}

# Transform an agent file for OpenCode compatibility if targeting OpenCode
format_agent_for_destination() {
    local file_path="$1"
    if [[ "$TARGET_PLATFORM" == "opencode" ]]; then
        # Create temp file
        local tmp_file="${file_path}.tmp"
        node -e '
        const fs = require("fs");
        const path = process.argv[1];
        let content = fs.readFileSync(path, "utf8");
        const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        if (match) {
            const fm = match[1];
            const body = content.slice(match[0].length);
            const descMatch = fm.match(/^description:\s*(.*)$/m);
            const desc = descMatch ? descMatch[1].trim() : "\"Subagent\"";
            const nameMatch = fm.match(/^name:\s*(.*)$/m);
            const name = nameMatch ? nameMatch[1].trim() : "agent";
            const toolsMatch = fm.match(/^tools:\s*(.*)$/m);
            const tools = toolsMatch ? toolsMatch[1].toLowerCase() : "";
            
            const hasEdit = tools.includes("write") || tools.includes("edit");
            const hasBash = tools.includes("bash");
            
            let newFm = `name: ${name}\ndescription: ${desc}\nmode: subagent`;
            if (!hasEdit || !hasBash) {
                newFm += `\npermission:`;
                if (!hasEdit) newFm += `\n  edit: deny`;
                if (!hasBash) newFm += `\n  bash: deny`;
            }
            content = `---\n${newFm}\n---${body}`;
            fs.writeFileSync(path, content, "utf8");
        }
        ' "$file_path" 2>/dev/null || true
    fi
}

download_agent() {
    local category="$1"
    local agent_file="$2"
    local dest_path="$3"
    local url="$GITHUB_RAW_BASE/categories/$category/$agent_file"

    if curl -sS "$url" -o "$dest_path" 2>/dev/null; then
        sed -i.bak '/^model: \(sonnet\|opus\|haiku\)$/d' "$dest_path" 2>/dev/null && rm -f "$dest_path.bak"
        format_agent_for_destination "$dest_path"
        return 0
    else
        return 1
    fi
}

select_platform() {
    show_header
    echo -e "${BOLD}Select Target Assistant Platform:${NC}\n"

    echo -e "  ${YELLOW}1)${NC} ${CYAN}ZCode${NC}     - ~/.zcode/agents/ (or .zcode/agents/)"
    echo -e "  ${YELLOW}2)${NC} ${MAGENTA}OpenCode${NC}  - ~/.config/opencode/agents/ (or .opencode/agents/)"
    echo ""
    echo -e "  ${YELLOW}q)${NC} Quit"
    echo ""

    read -p "Enter your choice [1-2]: " choice

    case "$choice" in
        1)
            TARGET_PLATFORM="zcode"
            ;;
        2)
            TARGET_PLATFORM="opencode"
            ;;
        q|Q)
            echo -e "\n${GREEN}Goodbye!${NC}"
            exit 0
            ;;
        *)
            echo -e "${RED}Invalid choice. Defaulting to ZCode.${NC}"
            TARGET_PLATFORM="zcode"
            sleep 1
            ;;
    esac
}

select_source_mode() {
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

select_install_mode() {
    local global_dir=""
    local local_dir=""
    local has_local=0

    if [[ "$TARGET_PLATFORM" == "opencode" ]]; then
        global_dir="$OPENCODE_GLOBAL_DIR"
        local_dir="$OPENCODE_LOCAL_DIR"
        has_local_opencode_dir && has_local=1
    else
        global_dir="$ZCODE_GLOBAL_DIR"
        local_dir="$ZCODE_LOCAL_DIR"
        has_local_zcode_dir && has_local=1
    fi

    if [[ -n "$INSTALL_MODE" ]]; then
        if [[ "$INSTALL_MODE" == "local" ]]; then
            TARGET_AGENTS_DIR="$local_dir"
        else
            TARGET_AGENTS_DIR="$global_dir"
        fi
        mkdir -p "$TARGET_AGENTS_DIR"
        return
    fi

    show_header
    echo -e "${BOLD}Select installation mode for ${CYAN}${TARGET_PLATFORM}${NC}:${NC}\n"

    echo -e "  ${YELLOW}1)${NC} Global installation ${CYAN}($global_dir)${NC}"
    echo -e "     Available for all projects"
    echo ""

    if [[ $has_local -eq 1 ]]; then
        echo -e "  ${YELLOW}2)${NC} Local project installation ${CYAN}($local_dir)${NC}"
        echo -e "     Only for current project"
    else
        echo -e "  ${YELLOW}2)${NC} Local project installation ${CYAN}($local_dir)${NC}"
        echo -e "     ${YELLOW}(Will create directory in current project)${NC}"
    fi
    echo ""
    echo -e "  ${YELLOW}q)${NC} Quit"
    echo ""

    read -p "Enter your choice: " choice

    case "$choice" in
        1)
            TARGET_AGENTS_DIR="$global_dir"
            INSTALL_MODE="global"
            mkdir -p "$TARGET_AGENTS_DIR"
            ;;
        2)
            TARGET_AGENTS_DIR="$local_dir"
            INSTALL_MODE="local"
            mkdir -p "$TARGET_AGENTS_DIR"
            ;;
        q|Q)
            echo -e "\n${GREEN}Goodbye!${NC}"
            exit 0
            ;;
        *)
            echo -e "${RED}Invalid choice. Defaulting to global.${NC}"
            TARGET_AGENTS_DIR="$global_dir"
            INSTALL_MODE="global"
            mkdir -p "$TARGET_AGENTS_DIR"
            sleep 1
            ;;
    esac
}

show_header() {
    clear
    echo -e "${BOLD}${CYAN}"
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║       Awesome Subagents Installer (ZCode & OpenCode)         ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    if [[ -n "$TARGET_AGENTS_DIR" ]]; then
        local platform_color="${CYAN}"
        [[ "$TARGET_PLATFORM" == "opencode" ]] && platform_color="${MAGENTA}"
        echo -e "Platform: ${platform_color}${BOLD}${TARGET_PLATFORM}${NC} | Target: ${BLUE}${TARGET_AGENTS_DIR}${NC}"
        echo ""
    fi
}

get_category_name() {
    local dir="$1"
    echo "$dir" | sed 's/^[0-9]*-//' | tr '-' ' ' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) tolower(substr($i,2))}1'
}

select_category() {
    show_header
    echo -e "${BOLD}Select a category:${NC}\n"

    local categories=()
    local i=1

    if [[ "$SOURCE_MODE" == "remote" ]]; then
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
        for dir in "$CATEGORIES_DIR"/*/; do
            if [[ -d "$dir" && $(basename "$dir") != "." ]]; then
                local dirname=$(basename "$dir")
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

select_agents() {
    local category="$1"
    local category_name=$(get_category_name "$category")

    local agents=()
    local agent_states=()

    if [[ "$SOURCE_MODE" == "remote" ]]; then
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
            if [[ -f "$TARGET_AGENTS_DIR/$agent_file" ]]; then
                agent_states+=(1)
            else
                agent_states+=(0)
            fi
        done
    else
        local category_path="$CATEGORIES_DIR/$category"
        for agent_file in "$category_path"/*.md; do
            local basename=$(basename "$agent_file")
            if [[ "$basename" != "README.md" ]]; then
                agents+=("$basename")
                if [[ -f "$TARGET_AGENTS_DIR/$basename" ]]; then
                    agent_states+=(1)
                else
                    agent_states+=(0)
                fi
            fi
        done
    fi

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

            if [[ -f "$TARGET_AGENTS_DIR/$agent_file" ]]; then
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
                local to_install=()
                local to_uninstall=()

                for i in "${!agents[@]}"; do
                    local agent_file="${agents[$i]}"
                    local is_selected=${agent_states[$i]}
                    local was_installed=0
                    if [[ -f "$TARGET_AGENTS_DIR/$agent_file" ]]; then
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

confirm_and_apply() {
    local category="$1"
    local install_list="$2"
    local uninstall_list="$3"

    IFS=' ' read -ra to_install <<< "$install_list"
    IFS=' ' read -ra to_uninstall <<< "$uninstall_list"

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

        for agent_file in "${to_install[@]}"; do
            if [[ -n "$agent_file" ]]; then
                if [[ "$SOURCE_MODE" == "remote" ]]; then
                    echo -e "${CYAN}Downloading $agent_file...${NC}"
                    if download_agent "$category" "$agent_file" "$TARGET_AGENTS_DIR/$agent_file"; then
                        echo -e "${GREEN}✓${NC} Installed: $agent_file"
                    else
                        echo -e "${RED}✗${NC} Failed to download: $agent_file"
                    fi
                else
                    local source_path="$CATEGORIES_DIR/$category/$agent_file"
                    if [[ -f "$source_path" ]]; then
                        cp "$source_path" "$TARGET_AGENTS_DIR/$agent_file"
                        format_agent_for_destination "$TARGET_AGENTS_DIR/$agent_file"
                        echo -e "${GREEN}✓${NC} Installed: $agent_file"
                    fi
                fi
            fi
        done

        for agent_file in "${to_uninstall[@]}"; do
            if [[ -n "$agent_file" ]]; then
                if [[ -f "$TARGET_AGENTS_DIR/$agent_file" ]]; then
                    rm "$TARGET_AGENTS_DIR/$agent_file"
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

main() {
    select_platform
    select_install_mode
    select_source_mode
    while true; do
        select_category
        while select_agents "$SELECTED_CATEGORY"; do
            :
        done
    done
}

main
