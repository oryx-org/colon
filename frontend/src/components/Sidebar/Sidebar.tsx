import { LuSearch, LuSettings, LuFiles, LuBlocks, LuTerminal, LuGitBranch, LuBug } from 'react-icons/lu';

import './Sidebar.css';
import './Sidebar.css';

interface SidebarProps {
    activeTab: string;
    setActiveTab: (tab: string) => void;
    showTerminal?: boolean;
    setShowTerminal?: (show: boolean) => void;
    onSettingsClick?: () => void;
}

function Sidebar({ activeTab, setActiveTab, showTerminal, setShowTerminal, onSettingsClick }: SidebarProps) {

    return (
        <div className="sidebar">
            <div className="sidebar-top">
                <button
                    className={`sidebar-btn ${activeTab === 'folder' ? 'active' : ''}`}
                    onClick={() => setActiveTab('folder')}
                    title="Explorer"
                >
                    <LuFiles className="sidebar-icon-svg" />
                </button>
                <button
                    className={`sidebar-btn ${activeTab === 'search' ? 'active' : ''}`}
                    onClick={() => setActiveTab('search')}
                    title="Search"
                >
                    <LuSearch className="sidebar-icon-svg" />
                </button>
                <button
                    className={`sidebar-btn ${activeTab === 'git' ? 'active' : ''}`}
                    onClick={() => setActiveTab('git')}
                    title="Source Control"
                >
                    <LuGitBranch className="sidebar-icon-svg" />
                </button>
                <button
                    className={`sidebar-btn ${activeTab === 'debug' ? 'active' : ''}`}
                    onClick={() => setActiveTab('debug')}
                    title="Run and Debug"
                >
                    <LuBug className="sidebar-icon-svg" />
                </button>
                <button
                    className={`sidebar-btn ${activeTab === 'category' ? 'active' : ''}`}
                    onClick={() => setActiveTab('category')}
                    title="Extensions"
                >
                    <LuBlocks className="sidebar-icon-svg category-img" />
                </button>
                <button
                    className={`sidebar-btn ${showTerminal ? 'active' : ''}`}
                    onClick={() => setShowTerminal?.(!showTerminal)}
                    title="Toggle Terminal"
                >
                    <LuTerminal className="sidebar-icon-svg" />
                </button>
            </div>

            <div className="sidebar-bottom">
                <button
                    className="sidebar-btn"
                    onClick={onSettingsClick}
                    title="Settings"
                >
                    <LuSettings className="sidebar-icon-svg" />
                </button>
            </div>
        </div>
    );
}

export default Sidebar;
