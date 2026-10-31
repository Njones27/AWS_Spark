import { KeyNotice } from './components/BuilderKey';
import { ADVANCED } from './data/advanced';
import { CHAPTER_2 } from './data/chapter2';
import { CHAPTER_1 } from './data/levels';
import { Home } from './screens/Home';
import { LevelMap } from './screens/LevelMap';
import { LevelPlay } from './screens/LevelPlay';
import { Playground } from './screens/Playground';
import { StyleGuide } from './screens/StyleGuide';
import { useRoute, type Route } from './router';

export function App() {
  const route = useRoute();
  return (
    <>
      <Screen route={route} />
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
