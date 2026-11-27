import { Buffer } from 'buffer';
import QuickCrypto from 'react-native-quick-crypto';
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

global.Buffer = global.Buffer || Buffer;
QuickCrypto.install();
AppRegistry.registerComponent(appName, () => App);
