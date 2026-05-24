import { AdvancedPanel } from './AdvancedPanel';
import { FormatPanel } from './FormatPanel';
import { Icon } from './Icon';
import { OutputPanel } from './OutputPanel';
import { PresetsBar } from './PresetsBar';
import { SizePanel } from './SizePanel';

export function ConfigPanel() {
  return (
    <section className="pane">
      <div className="panel-head">
        <div className="panel-title">
          <Icon name="sliders" size={18} />
          Conversion matrix
        </div>
        <span className="hint">every image × every size × every format</span>
      </div>
      <div className="panel-body">
        <PresetsBar />
        <SizePanel />
        <FormatPanel />
        <OutputPanel />
        <AdvancedPanel />
      </div>
    </section>
  );
}
