import crypto from "node:crypto";
import querystring from "node:querystring";

import { OAUTH_BASIC_AUTH, OAUTH_CLIENT_ID } from "./constants.ts";
import { request, requestJson } from "./network.ts";

function extractCode(location: string): string {
  const code = location.match(/code=([^&]+)/)?.[1];
  if (!code) {
    throw new Error(`无法从回调地址提取 code: ${location}`);
  }
  return code;
}

function getSetCookies(headers: Record<string, string | string[] | undefined>): string[] {
  const raw = headers["set-cookie"];
  if (!raw) {
    return [];
  }
  if (Array.isArray(raw)) {
    return raw.map((value) => value.split(";", 1)[0]).filter(Boolean);
  }
  return raw.split(/,(?=[^;]+=[^;]+)/).map((value) => value.split(";", 1)[0]).filter(Boolean);
}

function extractSigninPayload(html: string): {
  challenge: string;
  csrfToken: string;
  device: Record<string, unknown>;
} {
  const json = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/)?.[1];
  if (!json) {
    throw new Error("无法从 signin 页面提取 __NEXT_DATA__");
  }
  const data = JSON.parse(json) as {
    props?: {
      pageProps?: {
        challenge?: string;
        csrftoken?: string;
        device?: Record<string, unknown>;
      };
    };
  };
  const pageProps = data.props?.pageProps;
  if (!pageProps?.challenge || !pageProps?.csrftoken || !pageProps.device) {
    throw new Error("signin 页面缺少 challenge / csrftoken / device");
  }
  return {
    challenge: pageProps.challenge,
    csrfToken: pageProps.csrftoken,
    device: pageProps.device,
  };
}

export function rsaEncrypt(message: string, publicKey: string): string {
  const encrypted = crypto.publicEncrypt(
    {
      key: publicKey,
      padding: crypto.constants.RSA_PKCS1_PADDING,
    },
    Buffer.from(message, "utf8"),
  );
  return encrypted.toString("base64");
}

export async function getAccessToken(
  baseUrl: string,
  username: string,
  encryptedPassword: string,
): Promise<string> {
  const state = "10305f4bf6eff89d543f34a6ab4d4f9f2e23003e";
  const authUrl = `${baseUrl}/oauth2/auth?${querystring.stringify({
    client_id: OAUTH_CLIENT_ID,
    redirect_uri: "anyshare://oauth2/login/callback",
    response_type: "code",
    state,
    scope: "offline openid all",
    platform: "windows",
    version: "7.0.3.0",
    language: "zh-CN",
    from: "richclient",
    client_version: "7.0.3.0",
    os: "windows-10.0.19045-amd64",
    device_name: "RichClient for windows",
    device_guid: "00-50-56-C0-00-01",
  })}`;

  const cookies: string[] = [];
  const pushCookies = (headers: Record<string, string | string[] | undefined>) => {
    for (const cookie of getSetCookies(headers)) {
      cookies.push(cookie);
    }
  };
  const cookieHeader = () => cookies.join("; ");

  const authResponse = await request(authUrl, {
    headers: {
      Connection: "close",
    },
  });
  pushCookies(authResponse.headers);
  const signinUrl = authResponse.headers.location;
  if (!signinUrl) {
    throw new Error("oauth2/auth 未返回 signin 地址");
  }

  const signinPage = await request(signinUrl, {
    headers: {
      cookie: cookieHeader(),
      Connection: "close",
    },
  });
  pushCookies(signinPage.headers);
  const signinMeta = extractSigninPayload(signinPage.body.toString("utf8"));

  const signin = await requestJson<{ redirect: string }>(`${baseUrl}/oauth2/signin`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: cookieHeader(),
      referer: signinUrl,
      Connection: "close",
    },
    body: JSON.stringify({
      _csrf: signinMeta.csrfToken,
      challenge: signinMeta.challenge,
      account: username,
      password: encryptedPassword,
      vcode: { id: "", content: "" },
      dualfactorauthinfo: {
        validcode: { vcode: "" },
        OTP: { OTP: "" },
      },
      remember: false,
      device: signinMeta.device,
    }),
  });

  const consent = await request(signin.redirect, {
    headers: {
      cookie: cookieHeader(),
      Connection: "close",
    },
  });
  pushCookies(consent.headers);
  const authWithConsentUrl = consent.headers.location;
  if (!authWithConsentUrl) {
    throw new Error("signin 后未返回 consent/auth 地址");
  }

  const authWithConsent = await request(authWithConsentUrl, {
    headers: {
      cookie: cookieHeader(),
      Connection: "close",
    },
  });
  pushCookies(authWithConsent.headers);
  const callbackAuthUrl = authWithConsent.headers.location;
  if (!callbackAuthUrl) {
    throw new Error("consent 后未返回 callback auth 地址");
  }

  const callbackRedirect = await request(callbackAuthUrl, {
    headers: {
      cookie: cookieHeader(),
      Connection: "close",
    },
  });
  pushCookies(callbackRedirect.headers);
  const location = callbackRedirect.headers.location || "";
  const code = extractCode(location);

  const boundary = "----WebKitFormBoundarywPAfbB36kbRTzgzy";
  const tokenBody = [
    `------WebKitFormBoundarywPAfbB36kbRTzgzy`,
    `Content-Disposition: form-data; name="grant_type"`,
    ``,
    `authorization_code`,
    `------WebKitFormBoundarywPAfbB36kbRTzgzy`,
    `Content-Disposition: form-data; name="code"`,
    ``,
    code,
    `------WebKitFormBoundarywPAfbB36kbRTzgzy`,
    `Content-Disposition: form-data; name="redirect_uri"`,
    ``,
    `anyshare://oauth2/login/callback`,
    `------WebKitFormBoundarywPAfbB36kbRTzgzy--`,
  ].join("\r\n");

  const tokenResponse = await requestJson<{ access_token: string }>(`${baseUrl}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      Authorization: OAUTH_BASIC_AUTH,
      Connection: "close",
    },
    body: tokenBody,
  });

  return tokenResponse.access_token;
}
