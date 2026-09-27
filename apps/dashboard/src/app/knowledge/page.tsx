'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, FileText, Search, Filter, BookOpen, HelpCircle, Package, Link, File, Inbox, LayoutTemplate } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { getChannelIcon, getChannelName } from '@/lib/channel-utils';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

interface KnowledgeItem {
  id: string;
  title: string;
  content: string;
  type: string;
  category?: string;
  createdAt: string;
  channels: string[];
}

export default function KnowledgePage() {
  const [knowledge, setKnowledge] = useState<KnowledgeItem[]>([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [channelFilter, setChannelFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('knowledge');
  const [newKnowledge, setNewKnowledge] = useState({
    title: '',
    content: '',
    type: 'general',
    category: '',
    channels: [] as string[],
  });
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [templates, setTemplates] = useState<any[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [usingTemplateId, setUsingTemplateId] = useState<string | null>(null);

  const knowledgeTypes = [
    { value: 'all', label: '所有类型', icon: <FileText style={{ width: 16, height: 16 }} /> },
    { value: 'product', label: '产品', icon: <Package style={{ width: 16, height: 16 }} /> },
    { value: 'faq', label: '常见问题', icon: <HelpCircle style={{ width: 16, height: 16 }} /> },
    { value: 'document', label: '文档', icon: <File style={{ width: 16, height: 16 }} /> },
    { value: 'url', label: '链接', icon: <Link style={{ width: 16, height: 16 }} /> },
    { value: 'general', label: '通用', icon: <BookOpen style={{ width: 16, height: 16 }} /> },
  ];

  const channels = [
    { value: 'all', label: '所有渠道' },
    { value: 'wechat', label: '微信' },
    { value: 'wecom', label: '企业微信' },
    { value: 'xiaohongshu', label: '小红书' },
    { value: 'douyin', label: '抖音' },
    { value: 'taobao', label: '淘宝' },
    { value: 'webchat', label: 'Web聊天' },
  ];

  useEffect(() => {
    fetchKnowledge();
  }, [page, limit, search, typeFilter, channelFilter]);

  const fetchKnowledge = async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        ...(search && { search }),
        ...(typeFilter !== 'all' && { type: typeFilter }),
        ...(channelFilter !== 'all' && { channel: channelFilter }),
      });

      const endpoint = `${API}/knowledge?${params.toString()}`;

      const res = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (res.ok) {
        const data = await res.json();
        setKnowledge(data.data);
        setTotal(data.total);
      } else {
        toast({
          title: "Error",
          description: "Failed to fetch knowledge",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error fetching knowledge:', error);
      toast({
        title: "Error",
        description: "Failed to fetch knowledge",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateKnowledge = async () => {
    try {
      const token = localStorage.getItem('token');
      const url = editingId ? `${API}/knowledge/${editingId}` : `${API}/knowledge`;
      const method = editingId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(newKnowledge),
      });

      if (res.ok) {
        setIsDialogOpen(false);
        resetForm();
        fetchKnowledge();
        toast({
          title: "Success",
          description: `Knowledge ${editingId ? 'updated' : 'created'} successfully`,
        });
      } else {
        const error = await res.json();
        toast({
          title: "Error",
          description: error.message || `Failed to ${editingId ? 'update' : 'create'} knowledge`,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error saving knowledge:', error);
      toast({
        title: "Error",
        description: `Failed to ${editingId ? 'update' : 'create'} knowledge`,
        variant: "destructive",
      });
    }
  };

  const handleEditKnowledge = (item: KnowledgeItem) => {
    setNewKnowledge({
      title: item.title,
      content: item.content,
      type: item.type,
      category: item.category || '',
      channels: item.channels || [],
    });
    setEditingId(item.id);
    setIsDialogOpen(true);
  };

  const handleDeleteKnowledge = async (id: string) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/knowledge/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
        fetchKnowledge();
        toast({
          title: "Success",
          description: "Knowledge deleted successfully",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to delete knowledge",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error deleting knowledge:', error);
      toast({
        title: "Error",
        description: "Failed to delete knowledge",
        variant: "destructive",
      });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ['.txt', '.md', '.pdf', '.docx'];
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    if (!allowed.includes(ext)) {
      setUploadError('仅支持 txt / md / pdf / docx 格式');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('文件不能超过 10MB');
      return;
    }
    setUploading(true);
    setUploadError('');
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API}/knowledge/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (res.ok) {
        toast({ title: "成功", description: `文件「${file.name}」已导入知识库` });
        fetchKnowledge();
      } else {
        const err = await res.json().catch(() => ({}));
        setUploadError(err.message || '上传失败，请重试');
      }
    } catch (error) {
      console.error('Upload error:', error);
      setUploadError('网络错误，上传失败');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const resetForm = () => {
    setNewKnowledge({
      title: '',
      content: '',
      type: 'general',
      category: '',
      channels: [],
    });
    setEditingId(null);
  };

  const fetchTemplates = async () => {
    try {
      setTemplatesLoading(true);
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/knowledge-templates`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTemplates(Array.isArray(data) ? data : []);
      } else {
        toast({ title: 'Error', description: 'Failed to fetch templates', variant: 'destructive' });
      }
    } catch (error) {
      console.error('Error fetching templates:', error);
      toast({ title: 'Error', description: 'Failed to fetch templates', variant: 'destructive' });
    } finally {
      setTemplatesLoading(false);
    }
  };

  const useTemplate = async (id: string) => {
    try {
      setUsingTemplateId(id);
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/knowledge-templates/${id}/use`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast({ title: '成功', description: '模板已复制到你的知识库，可自由修改' });
        setActiveTab('knowledge');
        fetchKnowledge();
      } else {
        const err = await res.json().catch(() => ({}));
        toast({ title: 'Error', description: err.message || '复制失败', variant: 'destructive' });
      }
    } catch (error) {
      console.error('Use template error:', error);
      toast({ title: 'Error', description: '复制失败', variant: 'destructive' });
    } finally {
      setUsingTemplateId(null);
    }
  };

  const toggleChannel = (channel: string) => {
    setNewKnowledge(prev => {
      const channels = prev.channels.includes(channel)
        ? prev.channels.filter(c => c !== channel)
        : [...prev.channels, channel];

      return { ...prev, channels };
    });
  };

  const getTypeIcon = (type: string) => {
    const typeColorMap: Record<string, string> = {
      product: 'var(--info)',
      faq: 'var(--success)',
      document: 'var(--accent)',
      url: 'var(--warning)',
      general: 'var(--text-tertiary)',
    };
    const color = typeColorMap[type] || 'var(--text-tertiary)';
    const icons: Record<string, React.ReactNode> = {
      product: <Package style={{ width: 16, height: 16, color }} />,
      faq: <HelpCircle style={{ width: 16, height: 16, color }} />,
      document: <File style={{ width: 16, height: 16, color }} />,
      url: <Link style={{ width: 16, height: 16, color }} />,
      general: <BookOpen style={{ width: 16, height: 16, color }} />,
    };
    return icons[type] || icons.general;
  };

  const getTypeLabel = (type: string) => {
    const typeObj = knowledgeTypes.find(t => t.value === type);
    return typeObj ? typeObj.label : type;
  };

  const getChannelsInfo = (channels: string[]) => {
    if (channels.length === 0) {
      return <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>所有渠道</span>;
    }

    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {channels.map(channel => (
          <span key={channel} style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '3px 8px',
            borderRadius: 8,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            fontSize: 11,
            color: 'var(--text-secondary)',
          }}>
            {getChannelIcon(channel)}
            <span>{getChannelName(channel)}</span>
          </span>
        ))}
      </div>
    );
  };

  return (
    <div className="fade-in-up" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Knowledge Base</div>
          <h1>知识管理</h1>
          <p className="page-subtitle">管理和组织客服使用的知识库，让回答更精准</p>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <label className="btn-ghost" style={{
            cursor: uploading ? 'not-allowed' : 'pointer',
            opacity: uploading ? 0.6 : 1,
          }}>
            <FileText style={{ width: 16, height: 16 }} />
            {uploading ? '上传中...' : '上传文件'}
            <input
              type="file"
              accept=".txt,.md,.pdf,.docx"
              style={{ display: 'none' }}
              onChange={handleFileUpload}
              disabled={uploading}
            />
          </label>

          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            if (!open) resetForm();
            setIsDialogOpen(open);
          }}>
            <DialogTrigger asChild>
              <button className="btn-primary" onClick={() => setIsDialogOpen(true)}>
                <Plus style={{ width: 15, height: 15 }} />
                添加知识
              </button>
            </DialogTrigger>
            <DialogContent style={{ borderRadius: 16, maxWidth: 600, background: 'var(--bg-card)', border: '1px solid var(--border-strong)' }}>
              <DialogHeader>
                <DialogTitle style={{ fontSize: 16, fontWeight: 600 }}>
                  {editingId ? '编辑知识' : '添加知识'}
                </DialogTitle>
              </DialogHeader>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 0' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <Label htmlFor="title" style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-secondary)' }}>
                    标题
                  </Label>
                  <Input
                    id="title"
                    placeholder="输入知识标题..."
                    value={newKnowledge.title}
                    onChange={(e) => setNewKnowledge({...newKnowledge, title: e.target.value})}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <Label htmlFor="type" style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-secondary)' }}>
                    类型
                  </Label>
                  <Select
                    value={newKnowledge.type}
                    onValueChange={(value) => setNewKnowledge({...newKnowledge, type: value})}
                  >
                    <SelectTrigger style={{ width: '100%' }}>
                      <SelectValue placeholder="选择类型" />
                    </SelectTrigger>
                    <SelectContent style={{ background: 'var(--bg-card)', border: '1px solid var(--border-strong)', borderRadius: 12 }}>
                      {knowledgeTypes.filter(t => t.value !== 'all').map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {type.icon}
                            <span>{type.label}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <Label htmlFor="category" style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-secondary)' }}>
                    分类
                  </Label>
                  <Input
                    id="category"
                    placeholder="例如：产品、支持、销售"
                    value={newKnowledge.category}
                    onChange={(e) => setNewKnowledge({...newKnowledge, category: e.target.value})}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <Label style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-secondary)' }}>
                    适用渠道
                  </Label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {channels.filter(c => c.value !== 'all').map((channel) => {
                      const active = newKnowledge.channels.includes(channel.value);
                      return (
                        <button
                          key={channel.value}
                          type="button"
                          onClick={() => toggleChannel(channel.value)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            padding: '7px 12px',
                            borderRadius: 9,
                            fontSize: 12,
                            fontWeight: active ? 600 : 500,
                            cursor: 'pointer',
                            transition: 'all 150ms ease',
                            background: active ? 'var(--accent-soft)' : 'var(--bg-surface)',
                            color: active ? 'var(--accent)' : 'var(--text-secondary)',
                            border: active ? '1px solid var(--accent)' : '1px solid var(--border-default)',
                          }}
                        >
                          {getChannelIcon(channel.value)}
                          <span>{channel.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <Label htmlFor="content" style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-secondary)' }}>
                    内容
                  </Label>
                  <Textarea
                    id="content"
                    rows={6}
                    placeholder="输入知识内容..."
                    value={newKnowledge.content}
                    onChange={(e) => setNewKnowledge({...newKnowledge, content: e.target.value})}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
                <button className="btn-ghost" onClick={() => setIsDialogOpen(false)}>
                  取消
                </button>
                <button className="btn-primary" onClick={handleCreateKnowledge}>
                  {editingId ? '更新' : '保存'}
                </button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          className={activeTab === 'knowledge' ? 'btn-primary' : 'btn-ghost'}
          onClick={() => setActiveTab('knowledge')}
          style={{ fontSize: 13 }}
        >
          我的知识库
        </button>
        <button
          className={activeTab === 'templates' ? 'btn-primary' : 'btn-ghost'}
          onClick={() => { setActiveTab('templates'); fetchTemplates(); }}
          style={{ fontSize: 13 }}
        >
          模板库
        </button>
      </div>

      {uploadError && (
        <div style={{
          padding: '10px 14px',
          borderRadius: 10,
          background: 'var(--danger-soft)',
          border: '1px solid var(--danger)',
          color: 'var(--danger)',
          fontSize: 13,
          fontWeight: 500,
        }}>
          {uploadError}
        </div>
      )}

      {activeTab === 'knowledge' && (
      <>
      <div style={{
        display: 'flex',
        gap: 10,
        flexWrap: 'wrap',
        alignItems: 'center',
      }}>
        <div style={{ flex: '1 1 240px', minWidth: 240, position: 'relative' }}>
          <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: 'var(--text-tertiary)' }} />
          <Input
            placeholder="搜索知识..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 40 }}
          />
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger style={{ width: 150 }}>
              <Filter style={{ width: 15, height: 15, marginRight: 6 }} />
              <SelectValue placeholder="按类型筛选" />
            </SelectTrigger>
            <SelectContent style={{ background: 'var(--bg-card)', border: '1px solid var(--border-strong)', borderRadius: 12 }}>
              {knowledgeTypes.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {type.icon}
                    <span>{type.label}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={channelFilter} onValueChange={setChannelFilter}>
            <SelectTrigger style={{ width: 150 }}>
              <Filter style={{ width: 15, height: 15, marginRight: 6 }} />
              <SelectValue placeholder="按渠道筛选" />
            </SelectTrigger>
            <SelectContent style={{ background: 'var(--bg-card)', border: '1px solid var(--border-strong)', borderRadius: 12 }}>
              {channels.map((channel) => (
                <SelectItem key={channel.value} value={channel.value}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {channel.value !== 'all' && getChannelIcon(channel.value)}
                    <span>{channel.label}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {isLoading ? (
          <div className="empty-state">
            <div className="empty-icon"><BookOpen size={20} strokeWidth={1.7} color="var(--text-tertiary)" /></div>
            <div className="empty-title">加载中</div>
            <div className="empty-desc">正在获取知识列表</div>
          </div>
        ) : knowledge.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon"><Inbox size={22} strokeWidth={1.7} color="var(--accent)" /></div>
            <div className="empty-title">暂无知识条目</div>
            <div className="empty-desc">
              {search || typeFilter !== 'all' || channelFilter !== 'all'
                ? '没有符合筛选条件的知识，尝试调整筛选条件'
                : '点击「添加知识」或上传文件开始构建你的知识库'}
            </div>
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ minWidth: 900 }}>
                <thead>
                  <tr>
                    {['类型', '标题', '分类', '内容预览', '渠道', '创建时间', '操作'].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {knowledge.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {getTypeIcon(item.type)}
                          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{getTypeLabel(item.type)}</span>
                        </div>
                      </td>
                      <td style={{ fontWeight: 500, color: 'var(--text-primary)', maxWidth: 200 }}>
                        {item.title}
                      </td>
                      <td style={{ color: item.category ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
                        {item.category || '—'}
                      </td>
                      <td style={{ maxWidth: 320 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.content || <span style={{ color: 'var(--text-muted)' }}>无内容</span>}
                        </div>
                      </td>
                      <td>
                        {getChannelsInfo(item.channels)}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {new Date(item.createdAt).toLocaleString()}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button
                            className="btn-ghost"
                            style={{ padding: '6px 11px', fontSize: 12 }}
                            onClick={() => handleEditKnowledge(item)}
                          >
                            编辑
                          </button>
                          <button
                            className="btn-ghost"
                            style={{ padding: '6px 11px', fontSize: 12, color: 'var(--danger)' }}
                            onClick={() => handleDeleteKnowledge(item.id)}
                          >
                            <Trash2 style={{ width: 13, height: 13 }} />
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '16px 24px',
              borderTop: '1px solid var(--border-default)',
              gap: 16,
              flexWrap: 'wrap',
            }}>
              <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
                显示 {(page - 1) * limit + 1} 到 {Math.min(page * limit, total)} 条，共 {total} 条
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn-ghost"
                  style={{ padding: '7px 13px', fontSize: 12.5 }}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  上一页
                </button>
                <button
                  className="btn-ghost"
                  style={{ padding: '7px 13px', fontSize: 12.5 }}
                  onClick={() => setPage(p => p + 1)}
                  disabled={page * limit >= total}
                >
                  下一页
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      </>
      )}

      {activeTab === 'templates' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>知识库模板</h2>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
                选择系统模板，一键复制到你的知识库后自由修改
              </p>
            </div>
            <button className="btn-ghost" onClick={fetchTemplates} style={{ fontSize: 12.5 }}>刷新</button>
          </div>

          {templatesLoading ? (
            <div className="empty-state">
              <div className="empty-icon"><BookOpen size={20} strokeWidth={1.7} color="var(--text-tertiary)" /></div>
              <div className="empty-title">加载中</div>
              <div className="empty-desc">正在获取模板列表</div>
            </div>
          ) : templates.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon"><Inbox size={22} strokeWidth={1.7} color="var(--accent)" /></div>
              <div className="empty-title">暂无模板</div>
              <div className="empty-desc">系统尚未发布模板</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {templates.map((t) => (
                <div key={t.id} className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <LayoutTemplate style={{ width: 18, height: 18, color: 'var(--accent)' }} />
                    <div style={{ fontSize: 15, fontWeight: 600 }}>{t.name}</div>
                  </div>
                  {t.category && (
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t.category}</span>
                  )}
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, minHeight: 36 }}>
                    {t.description || '—'}
                  </p>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                    {t.items?.length || 0} 条知识
                  </div>
                  <button
                    className="btn-primary"
                    disabled={usingTemplateId === t.id}
                    onClick={() => useTemplate(t.id)}
                    style={{ fontSize: 13 }}
                  >
                    {usingTemplateId === t.id ? '复制中…' : '使用模板'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
