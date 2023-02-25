# DerTunnel Changelog

## 0.4.3

- Upgrade deps

## 0.4.2

- Upgrade deps

## 0.4.1

- Upgrade deps

## 0.4.0

- Upgrade packaged binaries to node 18
- Drop Node < 16 support
- Upgrade deps

## 0.3.0

- Client connect options take the full client token instead of user/token (BREAKING)
- Add client alive pings to server (BREAKING requires current server)
  
## 0.2.5

- Force disconnect clients after ping timeout
- Allow client to replace their own endpoints

## 0.2.4

- Fix server error message on failed login
- Create server config automagically if config environment variables are set (docker)
- Change server connect rate limiting to account for client reconnect intervals

## 0.2.3

- Show local endpoint info in client
- Minor cosmetic changes in client UI

## 0.2.2

- Fix active connection counter when local connection errors occur
