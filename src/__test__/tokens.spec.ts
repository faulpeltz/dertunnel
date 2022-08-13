import { packToken, unpackToken } from "../shared/util";

describe("Tokens", () => {
    test("Token pack/unpack", async () => {
        const packed = packToken("dummy.foo.com", "user_foo", "p69b5m8067p56nvmbo68nya1");
        expect(packed).toBe("QZMfhJlXnZbz4VY3zIbti912mYduu8Z2TbNmw5dSjeNtw1gWTdbk15ISWZOj2lAm3dIyvV92mc");
        expect(unpackToken(packed)).toMatchObject({
            user: "user_foo",
            service: "service.dummy.foo.com",
            token: "p69b5m8067p56nvmbo68nya1"
        });
    });
});
