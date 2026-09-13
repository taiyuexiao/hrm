import React, { useState } from 'react';
import { Modal, Button, Input, Tooltip } from 'antd';
import { SectionDef } from '../../services/dailyApi';
import { parsePlainText, ParseRule } from './parseFill';

const { TextArea } = Input;

interface ParseModalProps {
  open: boolean;
  sections: SectionDef[];
  rules: ParseRule[];
  onApply: (mode: 'overwrite' | 'append', parsed: Record<string, string>) => void;
  onCancel: () => void;
}

/** 智能解析填入弹窗：粘贴整段文字 → 按栏目标题识别拆段 → 追加/覆盖填入 */
const ParseModal: React.FC<ParseModalProps> = ({ open, sections, rules, onApply, onCancel }) => {
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<Record<string, string> | null>(null);

  const handleCancel = () => {
    setText('');
    setParsed(null);
    onCancel();
  };

  return (
    <Modal title="✨ 智能解析填入" open={open} onCancel={handleCancel} width={860} footer={null}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 40px 1fr', gap: 12 }}>
        <div>
          <div style={{ marginBottom: 6, color: '#8c8c8c', fontSize: 12.5 }}>
            粘贴整段文字（含栏目标题时识别更准）
          </div>
          <TextArea
            value={text}
            onChange={e => { setText(e.target.value); setParsed(null); }}
            style={{ minHeight: 300, fontSize: 13, lineHeight: 1.8 }}
            placeholder={sections.map(s => `${s.label}：…`).join('\n')}
          />
        </div>
        <div style={{ alignSelf: 'center', textAlign: 'center' }}>
          <Button
            type="primary"
            shape="circle"
            icon="➜"
            disabled={!text.trim()}
            onClick={() => setParsed(parsePlainText(text, rules, sections.map(s => s.key), sections[0].key))}
          />
        </div>
        <div>
          <div style={{ marginBottom: 6, color: '#8c8c8c', fontSize: 12.5 }}>解析预览</div>
          <div style={{ minHeight: 300, maxHeight: 300, overflow: 'auto' }}>
            {parsed ? sections.map(sec => (
              <div key={sec.key} style={{ border: '1px solid #e8e8e8', borderRadius: 8, marginBottom: 8 }}>
                <div style={{
                  background: parsed[sec.key]?.trim() ? '#f6ffed' : '#fafafa',
                  color: parsed[sec.key]?.trim() ? '#389e0d' : '#bfbfbf',
                  fontSize: 12, padding: '4px 10px', fontWeight: 600,
                }}>
                  {sec.label}{parsed[sec.key]?.trim() ? '' : '（未识别到）'}
                </div>
                {parsed[sec.key]?.trim() && (
                  <div style={{ padding: '6px 10px', fontSize: 12.5, color: '#595959', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
                    {parsed[sec.key]}
                  </div>
                )}
              </div>
            )) : (
              <div style={{ color: '#bfbfbf', fontSize: 13, padding: '40px 0', textAlign: 'center' }}>
                点击中间按钮开始解析
              </div>
            )}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
        <Tooltip title="已有内容的栏目保留，解析结果追加到末尾">
          <Button disabled={!parsed} onClick={() => { onApply('append', parsed!); handleCancel(); }}>追加填入</Button>
        </Tooltip>
        <Tooltip title="解析结果替换对应栏目的现有内容">
          <Button type="primary" disabled={!parsed} onClick={() => { onApply('overwrite', parsed!); handleCancel(); }}>覆盖填入</Button>
        </Tooltip>
      </div>
    </Modal>
  );
};

export default ParseModal;
