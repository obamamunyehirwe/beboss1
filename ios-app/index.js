import { Buffer } from 'buffer';
import { install as installQuickCrypto } from 'react-native-quick-crypto';
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

global.Buffer = global.Buffer || Buffer;
installQuickCrypto();
AppRegistry.registerComponent(appName, () => App);
