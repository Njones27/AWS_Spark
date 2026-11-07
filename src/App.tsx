import { KeyNotice } from './components/BuilderKey';
import { ADVANCED } from './data/advanced';
import { CHAPTER_2 } from './data/chapter2';
import { CHAPTER_1 } from './data/levels';
import { Home } from './screens/Home';
import { LevelMap } from './screens/LevelMap';
import { LevelPlay } from './screens/LevelPlay';
import { Playground } from './screens/Playground';
import { StyleGuide } from './screens/StyleGuide';
import { English } from './i18n/English';
import { useRoute, type Route } from './router';

export function App() {
  const route = useRoute();
  return (
    <>
      {/* Only the title screen and the shared menus are translated so far; the rest stays English for now. */}
      {route.name === 'home' ? (
        <Screen route={route} />
      ) : (
        <English>
          <Screen route={route} />
        </English>
      )}
      <KeyNotice route={route.name} />
    </>
  );
}

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'map':
      return <LevelMap chapter={route.chapter === 'ch2' ? CHAPTER_2 : CHAPTER_1} />;
    case 'advanced':
      return <LevelMap chapter={ADVANCED} />;
    case 'level':
      return <LevelPlay id={route.id} />;
    case 'playground':
      return <Playground share={route.share} shareId={route.shareId} />;
    case 'styleguide':
      return <StyleGuide />;
    default:
      return <Home />;
  }
}
