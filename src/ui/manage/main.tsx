import { render } from 'preact';
import '../shared/theme.css';
import { App } from './App';
import { CodeAccessHost } from '../shared/CodeAccessHost';

render(<><App /><CodeAccessHost trackInput /></>, document.getElementById('app')!);
