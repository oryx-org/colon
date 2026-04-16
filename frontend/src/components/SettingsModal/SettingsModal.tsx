import { useEffect, useState } from 'react';
import { VscClose } from 'react-icons/vsc';
import './SettingsModal.css';

interface Settings {
    fontSize: number;
    tabSize: number;
    wordWrap: 'on' | 'off';
    theme: 'dark' | 'light';
}

const DEFAULT_SETTINGS: Settings = {
    fontSize: 14,
    tabSize: 4,
    wordWrap: 'off',
    theme: 'dark'
};

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSettingsChange: (settings: Settings) => void;
}

export function loadSettings(): Settings {
    const saved = localStorage.getItem('colon_settings');
    return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
}

function SettingsModal({ isOpen, onClose, onSettingsChange }: SettingsModalProps) {
    const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

    useEffect(() => {
        if (isOpen) setSettings(loadSettings());
    }, [isOpen]);

    if (!isOpen) return null;

    const update = (key: keyof Settings, value: any) => {
        const newSettings = { ...settings, [key]: value };
        setSettings(newSettings);
        localStorage.setItem('colon_settings', JSON.stringify(newSettings));
        onSettingsChange(newSettings);
    };

    return (
        <div className="settings-overlay" onClick={onClose}>
            <div className="settings-modal" onClick={e => e.stopPropagation()}>
                <div className="settings-header">
                    <h3>Settings</h3>
                    <button className="settings-close" onClick={onClose}><VscClose size={16} /></button>
                </div>
                <div className="settings-body">
                    <div className="setting-group">
                        <label>Editor Font Size</label>
                        <input
                            type="number"
                            value={settings.fontSize}
                            min={8} max={32}
                            onChange={e => update('fontSize', parseInt(e.target.value) || 14)}
                        />
                    </div>
                    <div className="setting-group">
                        <label>Tab Size</label>
                        <select
                            value={settings.tabSize}
                            onChange={e => update('tabSize', parseInt(e.target.value))}
                        >
                            <option value={2}>2 Spaces</option>
                            <option value={4}>4 Spaces</option>
                            <option value={8}>8 Spaces</option>
                        </select>
                    </div>
                    <div className="setting-group">
                        <label>Word Wrap</label>
                        <select
                            value={settings.wordWrap}
                            onChange={e => update('wordWrap', e.target.value)}
                        >
                            <option value="off">Off</option>
                            <option value="on">On</option>
                        </select>
                    </div>
                    <div className="setting-group">
                        <label>Theme</label>
                        <select
                            value={settings.theme}
                            disabled
                            title="Theme toggle coming soon"
                        >
                            <option value="dark">Colon Dark (Default)</option>
                            <option value="light">Colon Light</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default SettingsModal;
