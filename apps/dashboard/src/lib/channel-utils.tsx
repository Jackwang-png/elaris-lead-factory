import * as React from "react";

export function getChannelIcon(channel: string): React.ReactNode {
  switch (channel) {
    case 'wechat': return <span>💬</span>;
    case 'wecom': return <span>🏢</span>;
    case 'xiaohongshu': return <span>📖</span>;
    case 'douyin': return <span>🎵</span>;
    case 'taobao': return <span>🛍️</span>;
    case 'webchat': return <span>💻</span>;
    default: return <span>📱</span>;
  }
}

export function getChannelName(channel: string): string {
  switch (channel) {
    case 'wechat': return '微信';
    case 'wecom': return '企业微信';
    case 'xiaohongshu': return '小红书';
    case 'douyin': return '抖音';
    case 'taobao': return '淘宝';
    case 'webchat': return 'Web聊天';
    default: return channel;
  }
}
