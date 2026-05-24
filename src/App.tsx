import { Splitter, SplitterPanel } from 'fluxo-ui';
import { useState } from 'react';

import { AnnotationModal } from './components/AnnotationModal';
import { ConfigPanel } from './components/ConfigPanel';
import { Header } from './components/Header';
import { PreviewModal } from './components/PreviewModal';
import { ProcessFooter } from './components/ProcessFooter';
import { ResultsModal } from './components/ResultsModal';
import { SourcesPanel } from './components/SourcesPanel';
import { useDesktopChrome } from './hooks/useDesktopChrome';
import { useIntake } from './hooks/useIntake';
import './styles/app.scss';

export default function App() {
  useDesktopChrome();
  const { addFiles, addFolder } = useIntake();
  // Track only the *id* of the image being previewed / edited — the modals read
  // the live item from the store so in-session edits (crop, annotate) are always
  // reflected. Holding a snapshot here would freeze the pre-edit state.
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [annotateId, setAnnotateId] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);

  return (
    <div className="app">
      <Header onAddFiles={addFiles} onAddFolder={addFolder} />

      <Splitter className="app__body" responsive={980} gutterSize={6}>
        <SplitterPanel minSize="30%" defaultSize="54%">
          <SourcesPanel
            onAddFiles={addFiles}
            onAddFolder={addFolder}
            onPreview={(i) => setPreviewId(i.id)}
            onAnnotate={(i) => setAnnotateId(i.id)}
          />
        </SplitterPanel>
        <SplitterPanel minSize="30%">
          <ConfigPanel />
        </SplitterPanel>
      </Splitter>

      <ProcessFooter onShowResults={() => setShowResults(true)} />

      {previewId && <PreviewModal itemId={previewId} onClose={() => setPreviewId(null)} />}
      {annotateId && <AnnotationModal itemId={annotateId} onClose={() => setAnnotateId(null)} />}
      {showResults && <ResultsModal onClose={() => setShowResults(false)} />}
    </div>
  );
}
