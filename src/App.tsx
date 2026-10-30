import { Home } from './screens/Home';
import { LevelMap } from './screens/LevelMap';
import { LevelPlay } from './screens/LevelPlay';
import { Playground } from './screens/Playground';
import { StyleGuide } from './screens/StyleGuide';
import { useRoute } from './router';

export function App() {
  const route = useRoute();
  switch (route.name) {
    case 'map':
      return <LevelMap />;
    case 'level':
      return <LevelPlay id={route.id} />;
    case 'playground':
      return <Playground />;
    case 'styleguide':
      return <StyleGuide />;
    default:
      return <Home />;
  }
}
