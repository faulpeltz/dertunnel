# DerTunnel client

A client CLI and library for <https://github.com/faulpeltz/dertunnel>

Intended for creating public tunnel endpoints from code for e.g. running integration tests.

## Using the library

From JS/TS just call connectTunnel() with a token created in the server admin UI.

```typescript
import {} from "@faulpeltz/dertunnel";

let tunnelEndpoint = "";
const closeTunnel = await connectTunnel({
    clientToken: "YOURTUNNELTOKEN", // the token already contains the server url and credentials but can be overridden
    endpointPrefix: "my-test", // a prefix for the endpoint name (valid DNS name)
    waitForInitialConnection: true, // connectTunnel returns when connected, with the endpoint set
    onConnected: (ep) => tunnelEndpoint = ep,
});

// call closeTunnel() do remove the endpoint when done
```

## Using the CLI

The package also includes the CLI client - to forward local port 4000 to an endpoint called 'myendpoint' run

``npx @faulpeltz/dertunnel myendpoint 4000``

## License

(c) faulpeltz
[MIT](https://choosealicense.com/licenses/mit/)
