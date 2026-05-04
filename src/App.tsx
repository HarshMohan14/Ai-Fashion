import { useState } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { DirectorProvider } from './context/DirectorContext';
import { DirectorToasts } from './components/DirectorToasts';
import { Shell, SectionKey } from './components/Shell';
import { Boardroom } from './sections/Boardroom';
import { Wardrobe } from './sections/Wardrobe';
import { ExtractionLab } from './sections/ExtractionLab';
import { ModelHub } from './sections/ModelHub';
import { Scenarios } from './sections/Scenarios';
import { Runway } from './sections/Runway';
import { Looks } from './sections/Looks';
import { Analytics } from './sections/Analytics';
import { DateOrDump } from './sections/DateOrDump';

export default function App() {
  const [section, setSection] = useState<SectionKey>('boardroom');
  const isGameRoute = typeof window !== 'undefined'
    && window.location.pathname.replace(/\/+$/, '') === '/game';

  if (isGameRoute) {
    return (
      <ThemeProvider>
        <DirectorProvider>
          <DateOrDump />
          <DirectorToasts />
        </DirectorProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <DirectorProvider>
        <Shell current={section} onChange={setSection}>
          {section === 'boardroom' && <Boardroom />}
          {section === 'wardrobe' && <Wardrobe />}
          {section === 'lab' && <ExtractionLab />}
          {section === 'models' && <ModelHub />}
          {section === 'scenarios' && <Scenarios />}
          {section === 'runway' && <Runway />}
          {section === 'looks' && <Looks />}
          {section === 'analytics' && <Analytics />}
        </Shell>
        <DirectorToasts />
      </DirectorProvider>
    </ThemeProvider>
  );
}
