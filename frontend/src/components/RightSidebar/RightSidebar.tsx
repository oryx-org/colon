import { LuVideo } from 'react-icons/lu';
import './RightSidebar.css';

interface RightSidebarProps {
    activeTab: string;
    setActiveTab: (tab: string) => void;
}

function RightSidebar({ activeTab, setActiveTab }: RightSidebarProps) {

    return (
        <div className="right-sidebar">
            <div className="sidebar-top">
                <button
                    className={`sidebar-btn ${activeTab === 'video' ? 'active' : ''}`}
                    onClick={() => setActiveTab(activeTab === 'video' ? '' : 'video')}
                    title="Animation / Video"
                >
                    <LuVideo className="sidebar-icon-svg" />
                </button>
            </div>
        </div>
    );
}

export default RightSidebar;
