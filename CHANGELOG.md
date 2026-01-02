# DerTunnel Changelog

## 0.7.8

- Upgrade deps

## 0.7.7

- Upgrade deps

## 0.7.6

- Upgrade deps
  
## 0.7.5

- Upgrade deps

## 0.7.4

- Upgrade deps

## 0.7.3

- Upgrade deps

## 0.7.2

- Upgrade deps

## 0.7.1

- Fix abort handling in server and client tunnel messaging
- Fix async flow control when processing messages

## 0.7.0

- Include cli client in NPM package
- Allow initial configuration with environment variables

## 0.6.24

- Fix potential ACME DNS challenge race condition

## 0.6.23

- Upgrade deps
- Move to Express 5

## 0.6.22

- Upgrade deps

## 0.6.21

- Upgrade deps

## 0.6.20

- Upgrade deps
- Move to Node 22

## 0.6.19

- Upgrade deps

## 0.6.18

- Upgrade deps

## 0.6.17

- Fix Dockerfile build
- Upgrade deps

## 0.6.16

- Upgrade deps

## 0.6.15

- Upgrade deps

## 0.6.14

- Upgrade deps (new express minor 4.20)

## 0.6.13

- Upgrade deps (with current pkg-fetch binaries)

## 0.6.12

- Upgrade deps

## 0.6.11

- Upgrade deps

## 0.6.10

- Upgrade deps

## 0.6.9

- Add macOS builds
- Upgrade deps

## 0.6.8

- Collect bundled licenses in dist/LICENSES_bundled.txt

## 0.6.7

- Upgrade deps

## 0.6.6

- Upgrade deps

## 0.6.5

- Upgrade deps
- Fix a potential issue in client flow backpressure handling

## 0.6.4

- Upgrade deps

## 0.6.3

- Upgrade deps

## 0.6.2

- Enable Typescript setting 'noUncheckedIndexedAccess' and fix (minor) issues
- Upgrade deps

## 0.6.1

- Upgrade deps

## 0.6.0

- Upgrade deps
- Use esbuild for jest transform
- Use Node 20 binaries

## 0.5.0

- Upgrade deps and move to new pkg fork
- Deprecate Node 16 support and add Node 20 CI build

## 0.4.10

- Upgrade deps

## 0.4.9

- Upgrade deps

## 0.4.8

- Fix potential duplicate messages created by message parser
- Upgrade deps

## 0.4.7

- Upgrade deps

## 0.4.6

- Upgrade deps
  - bump pkg-fetch to latest for node 18.15 binary

## 0.4.5

- Upgrade deps
  - Bump TS to 5.0.3 (major upgrade)
  - Remove suppressImplicitAnyIndexErrors and fix some typings

## 0.4.4

- Upgrade deps

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
