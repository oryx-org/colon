import { LuX } from 'react-icons/lu';
import { useEffect, useState } from 'react';

import './SettingsModal.css';

interface Settings {
    fontSize: number;
    tabSize: number;
    wordWrap: 'on' | 'off';
    theme: 'dark' | 'light';
    minimap: boolean;
    fontFamily: string;
    formatOnSave: boolean;
}

const DEFAULT_SETTINGS: Settings = {
    fontSize: 14,
    tabSize: 4,
    wordWrap: 'off',
    theme: 'dark',
    minimap: false,
    fontFamily: "'JetBrains Mono', monospace",
    formatOnSave: true
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
                    <button className="settings-close" onClick={onClose}><LuX size={16} /></button>
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
                        <label>Font Family</label>
                        <select
                            value={settings.fontFamily}
                            onChange={e => update('fontFamily', e.target.value)}
                        >
                            <option value="'JetBrains Mono', monospace">JetBrains Mono</option>
                            <option value="'Fira Code', monospace">Fira Code</option>
                            <option value="Consolas, 'Courier New', monospace">Consolas</option>
                            <option value="'Cascadia Code', monospace">Cascadia Code</option>
                        </select>
                    </div>
                    <div className="setting-group">
                        <label>Show Minimap</label>
                        <select
                            value={settings.minimap ? 'yes' : 'no'}
                            onChange={e => update('minimap', e.target.value === 'yes')}
                        >
                            <option value="no">Hidden</option>
                            <option value="yes">Visible</option>
                        </select>
                    </div>
                    <div className="setting-group">
                        <label>Format on Save</label>
                        <select
                            value={settings.formatOnSave ? 'yes' : 'no'}
                            onChange={e => update('formatOnSave', e.target.value === 'yes')}
                        >
                            <option value="yes">Enabled</option>
                            <option value="no">Disabled</option>
                        </select>
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
                            onChange={e => update('theme', e.target.value as 'dark' | 'light')}
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
