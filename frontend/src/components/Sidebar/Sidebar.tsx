import { LuSearch, LuSettings } from 'react-icons/lu';
import { VscTerminal } from 'react-icons/vsc';
import folderIcon from '../../assets/figmaAssets/sideBar/folder-2.svg';
import categoryIcon from '../../assets/figmaAssets/sideBar/category-2.png';
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
                    <img src={folderIcon} alt="Folder" className="sidebar-icon-img" />
                </button>
                <button
                    className={`sidebar-btn ${activeTab === 'search' ? 'active' : ''}`}
                    onClick={() => setActiveTab('search')}
                    title="Search"
                >
                    <LuSearch className="sidebar-icon-svg" />
                </button>
                <button
                    className={`sidebar-btn ${activeTab === 'category' ? 'active' : ''}`}
                    onClick={() => setActiveTab('category')}
                    title="Extensions"
                >
                    <img src={categoryIcon} alt="Category" className="sidebar-icon-img category-img" />
                </button>
                <button
                    className={`sidebar-btn ${showTerminal ? 'active' : ''}`}
                    onClick={() => setShowTerminal?.(!showTerminal)}
                    title="Toggle Terminal"
                >
                    <VscTerminal className="sidebar-icon-svg" />
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
