import { useState } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { DirectorProvider } from './context/DirectorContext';
import { ExtractionQueueProvider } from './context/ExtractionQueueContext';
import { DirectorToasts } from './components/DirectorToasts';
import { ExtractionToaster } from './components/ExtractionToaster';
import { Shell, SectionKey } from './components/Shell';
import { Boardroom } from './sections/Boardroom';
import { Wardrobe } from './sections/Wardrobe';
import { ExtractionLab } from './sections/ExtractionLab';
import { ModelHub } from './sections/ModelHub';
import { Scenarios } from './sections/Scenarios';
import { Runway } from './sections/Runway';
import { Looks } from './sections/Looks';
import { Analytics } from './sections/Analytics';
import { Scout } from './sections/Scout';
import { DateOrDump } from './sections/DateOrDump';
import { ComiconDuel } from './sections/ComiconDuel';

export default function App() {
  const [section, setSection] = useState<SectionKey>('boardroom');
  const isGameRoute = typeof window !== 'undefined'
    && window.location.pathname.replace(/\/+$/, '') === '/game';
  
  const isComiconRoute = typeof window !== 'undefined'
    && window.location.pathname.replace(/\/+$/, '') === '/comicon';

  if (isGameRoute || isComiconRoute) {
    return (
      <ThemeProvider>
        <DirectorProvider>
          <ExtractionQueueProvider>
            {isGameRoute ? <DateOrDump /> : <ComiconDuel />}
            <DirectorToasts />
            <ExtractionToaster />
          </ExtractionQueueProvider>
        </DirectorProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <DirectorProvider>
          <ExtractionQueueProvider>
        <Shell current={section} onChange={setSection}>
          {section === 'boardroom' && <Boardroom />}
          {section === 'wardrobe' && <Wardrobe />}
          {section === 'scout' && <Scout />}
          {section === 'lab' && <ExtractionLab />}
          {section === 'models' && <ModelHub />}
          {section === 'scenarios' && <Scenarios />}
          {section === 'runway' && <Runway />}
          {section === 'looks' && <Looks />}
          {section === 'analytics' && <Analytics />}
        </Shell>
        <DirectorToasts />
          <ExtractionToaster />
      </ExtractionQueueProvider>
        </DirectorProvider>
    </ThemeProvider>
  );
}
