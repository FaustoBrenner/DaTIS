# Tasy Client Rebuild

Este documento detalha os rquisitos que o novo rebuild da ferramenta de interface com o Tasy deverá ter. 

## Requisitos

1. Linguagem: Node.JS
2. Fluxo de trabalho: Sem RPAs com a interface, fluxo completo por XHR, usando endpoint de OAuth para manter a chave de acesso atualizada.
3. Generalização: A interface deve funcionar não apenas para recuperação de relatórios, mas tambem outras rotinas de extração de dados que serão definidas por sequências de requests XHR.

## Fluxo de Extração por endpoint XHR

### Autenticação

Etapa que hoje é realizada por RPA, mas que deverá ser reescrita usando apenas os endpoints XHR. A seguir, você encontra a sequência de requests que são disparados pela interface durante o processo de autenticação. Aqui, não tenho a certeza de quais serão os requests fundamentais que precisaremos usar afinal para a validação, deixo a seu cargo identificar.

```
fetch("http://hismorumbi.rededor.corp/TasyAppServer/resources/public/system/isExpiredBetaServicePack", {
  "headers": {
    "accept": "application/json, text/plain, */*",
    "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7,fr;q=0.6",
    "active-feature-code": "281",
    "developer-mode": "false",
    "feature-code": "281",
    "feature-route": "atepaceh",
    "locale-customization": "all",
    "tasybackendversion": "dev",
    "cookie": "JSESSIONID=<JSESSIONID>; TASYAPPSERVER=tasy-tasyapp-2_2; hasPerformedSuccessfulLogin=true; Authorization=",
    "Referer": "http://hismorumbi.rededor.corp/"
  },
  "body": null,
  "method": "GET"
}); ;
fetch("http://hismorumbi.rededor.corp/TasyAppServer/resources/public/security/oauth", {
  "headers": {
    "accept": "application/json, text/plain, */*",
    "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7,fr;q=0.6",
    "content-type": "application/json;charset=UTF-8",
    "developer-mode": "false",
    "locale-customization": "all",
    "tasybackendversion": "dev",
    "cookie": "JSESSIONID=<JSESSIONID>; TASYAPPSERVER=tasy-tasyapp-2_2; hasPerformedSuccessfulLogin=true; Authorization=",
    "Referer": "http://hismorumbi.rededor.corp/"
  },
  "body": "{\"username\":\"fausto.brenner\",\"password\":\"<TASY_PASS>\",\"computerName\":null,\"osUsername\":null,\"scope\":\"WTASY\",\"timezone\":\"America/Sao_Paulo\",\"ipMachine\":null}",
  "method": "POST"
}); ;
fetch("http://hismorumbi.rededor.corp/TasyAppServer/resources/user/data", {
  "headers": {
    "accept": "application/json, text/plain, */*",
    "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7,fr;q=0.6",
    "active-feature-code": "281",
    "authorization": "BEARER <BEARER_TOKEN>",
    "crsftoken": "<CSRF_TOKEN>",
    "developer-mode": "false",
    "feature-code": "281",
    "feature-route": "atepaceh",
    "locale-customization": "all",
    "tasybackendversion": "dev",
    "cookie": "JSESSIONID=<JSESSIONID>; TASYAPPSERVER=tasy-tasyapp-2_2; hasPerformedSuccessfulLogin=true; Authorization=BEARER+<BEARER_TOKEN>",
    "Referer": "http://hismorumbi.rededor.corp/"
  },
  "body": null,
  "method": "GET"
}); ;
fetch("http://hismorumbi.rededor.corp/TasyAppServer/resources/user/existsMoreSessionsThanAllowed", {
  "headers": {
    "accept": "application/json, text/plain, */*",
    "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7,fr;q=0.6",
    "active-feature-code": "281",
    "authorization": "BEARER <BEARER_TOKEN>",
    "crsftoken": "<CSRF_TOKEN>",
    "developer-mode": "false",
    "feature-code": "281",
    "feature-route": "atepaceh",
    "locale-customization": "all",
    "tasybackendversion": "dev",
    "cookie": "JSESSIONID=<JSESSIONID>; TASYAPPSERVER=tasy-tasyapp-2_2; hasPerformedSuccessfulLogin=true; Authorization=BEARER+<BEARER_TOKEN>",
    "Referer": "http://hismorumbi.rededor.corp/"
  },
  "body": null,
  "method": "GET"
}); ;
fetch("http://hismorumbi.rededor.corp/TasyAppServer/resources/service/WParameter/getParameter", {
  "headers": {
    "accept": "application/json, text/plain, */*",
    "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7,fr;q=0.6",
    "active-feature-code": "281",
    "authorization": "BEARER <BEARER_TOKEN>",
    "content-type": "application/json;charset=UTF-8",
    "crsftoken": "<CSRF_TOKEN>",
    "developer-mode": "false",
    "feature-code": "281",
    "feature-route": "atepaceh",
    "locale-customization": "all",
    "tasybackendversion": "dev",
    "cookie": "JSESSIONID=<JSESSIONID>; TASYAPPSERVER=tasy-tasyapp-2_2; hasPerformedSuccessfulLogin=true; Authorization=BEARER+<BEARER_TOKEN>",
    "Referer": "http://hismorumbi.rededor.corp/"
  },
  "body": "[{\"tipo\":\"Integer\",\"valor\":0},{\"tipo\":\"Integer\",\"valor\":87}]",
  "method": "POST"
}); ;
fetch("http://hismorumbi.rededor.corp/TasyAppServer/resources/service/WParameter/getParameters", {
  "headers": {
    "accept": "application/json, text/plain, */*",
    "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7,fr;q=0.6",
    "active-feature-code": "281",
    "authorization": "BEARER <BEARER_TOKEN>",
    "content-type": "application/json;charset=UTF-8",
    "crsftoken": "<CSRF_TOKEN>",
    "developer-mode": "false",
    "feature-code": "281",
    "feature-route": "atepaceh",
    "locale-customization": "all",
    "tasybackendversion": "dev",
    "cookie": "JSESSIONID=<JSESSIONID>; TASYAPPSERVER=tasy-tasyapp-2_2; hasPerformedSuccessfulLogin=true; Authorization=BEARER+<BEARER_TOKEN>",
    "Referer": "http://hismorumbi.rededor.corp/"
  },
  "body": "[{\"tipo\":\"Integer\",\"valor\":0},{\"tipo\":\"ArrayList\",\"valor\":[66,87,91,102,128,129,160,178,215,221,235,240,243,244,245,246,252,254,259]}]",
  "method": "POST"
}); ;
fetch("http://hismorumbi.rededor.corp/TasyAppServer/resources/service/WParameter/getParameters", {
  "headers": {
    "accept": "application/json, text/plain, */*",
    "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7,fr;q=0.6",
    "active-feature-code": "281",
    "authorization": "BEARER <BEARER_TOKEN>",
    "content-type": "application/json;charset=UTF-8",
    "crsftoken": "<CSRF_TOKEN>",
    "developer-mode": "false",
    "feature-code": "281",
    "feature-route": "atepaceh",
    "locale-customization": "all",
    "tasybackendversion": "dev",
    "cookie": "JSESSIONID=<JSESSIONID>; TASYAPPSERVER=tasy-tasyapp-2_2; hasPerformedSuccessfulLogin=true; Authorization=BEARER+<BEARER_TOKEN>",
    "Referer": "http://hismorumbi.rededor.corp/"
  },
  "body": "[{\"tipo\":\"Integer\",\"valor\":6001},{\"tipo\":\"ArrayList\",\"valor\":[178,183,185]}]",
  "method": "POST"
}); ;
fetch("http://hismorumbi.rededor.corp/TasyAppServer/resources/tasy/terms/info", {
  "headers": {
    "accept": "application/json, text/plain, */*",
    "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7,fr;q=0.6",
    "active-feature-code": "281",
    "authorization": "BEARER <BEARER_TOKEN>",
    "content-type": "application/json;charset=UTF-8",
    "crsftoken": "<CSRF_TOKEN>",
    "developer-mode": "false",
    "feature-code": "281",
    "feature-route": "atepaceh",
    "locale-customization": "all",
    "tasybackendversion": "dev",
    "cookie": "JSESSIONID=<JSESSIONID>; TASYAPPSERVER=tasy-tasyapp-2_2; hasPerformedSuccessfulLogin=true; Authorization=BEARER+<BEARER_TOKEN>",
    "Referer": "http://hismorumbi.rededor.corp/"
  },
  "body": "{\"username\":\"fausto.brenner\"}",
  "method": "POST"
}); ;
fetch("http://hismorumbi.rededor.corp/version.json", {
  "headers": {
    "Referer": "http://hismorumbi.rededor.corp/"
  },
  "body": null,
  "method": "GET"
}); ;
fetch("http://localhost:4565/biometrics/resources/api/enabledAuthentication", {
  "headers": {
    "accept": "application/json, text/plain, */*",
    "content-type": "application/json;charset=UTF-8",
    "sec-ch-ua": "\"Not;A=Brand\";v=\"8\", \"Chromium\";v=\"150\", \"Google Chrome\";v=\"150\"",
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": "\"Windows\"",
    "Referer": "http://hismorumbi.rededor.corp/"
  },
  "body": "fausto.brenner",
  "method": "POST"
}); ;
fetch("http://hismorumbi.rededor.corp/TasyAppServer/resources/user/checkComputerEstablishment", {
  "headers": {
    "accept": "application/json, text/plain, */*",
    "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7,fr;q=0.6",
    "active-feature-code": "281",
    "authorization": "BEARER <BEARER_TOKEN>",
    "content-type": "application/json;charset=utf-8",
    "crsftoken": "<CSRF_TOKEN>",
    "developer-mode": "false",
    "feature-code": "281",
    "feature-route": "atepaceh",
    "locale-customization": "all",
    "tasybackendversion": "dev",
    "cookie": "JSESSIONID=<JSESSIONID>; TASYAPPSERVER=tasy-tasyapp-2_2; hasPerformedSuccessfulLogin=true; Authorization=BEARER+<BEARER_TOKEN>",
    "Referer": "http://hismorumbi.rededor.corp/"
  },
  "body": null,
  "method": "POST"
}); ;
fetch("http://hismorumbi.rededor.corp/TasyAppServer/resources/user/profile", {
  "headers": {
    "accept": "application/json, text/plain, */*",
    "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7,fr;q=0.6",
    "active-feature-code": "281",
    "authorization": "BEARER <BEARER_TOKEN>",
    "content-type": "application/json;charset=UTF-8",
    "crsftoken": "<CSRF_TOKEN>",
    "developer-mode": "false",
    "feature-code": "281",
    "feature-route": "atepaceh",
    "locale-customization": "all",
    "tasybackendversion": "dev",
    "cookie": "JSESSIONID=<JSESSIONID>; TASYAPPSERVER=tasy-tasyapp-2_2; hasPerformedSuccessfulLogin=true; Authorization=BEARER+<BEARER_TOKEN>; NGSESSION=4bb2e54a-404d-4cc9-a163-4f02c68258a1",
    "Referer": "http://hismorumbi.rededor.corp/"
  },
  "body": "{\"profile\":1939}",
  "method": "POST"
}); ;
fetch("http://hismorumbi.rededor.corp/TasyAppServer/resources/service/CommonService/hasCaseEnabled", {
  "headers": {
    "accept": "application/json, text/plain, */*",
    "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7,fr;q=0.6",
    "active-feature-code": "281",
    "authorization": "BEARER <BEARER_TOKEN>",
    "content-type": "application/json;charset=UTF-8",
    "crsftoken": "<CSRF_TOKEN>",
    "developer-mode": "false",
    "feature-code": "281",
    "feature-route": "atepaceh",
    "locale-customization": "all",
    "newuserdata": "14;167;1939;0",
    "tasybackendversion": "dev",
    "cookie": "JSESSIONID=<JSESSIONID>; TASYAPPSERVER=tasy-tasyapp-2_2; hasPerformedSuccessfulLogin=true; Authorization=BEARER+<BEARER_TOKEN>; NGSESSION=4bb2e54a-404d-4cc9-a163-4f02c68258a1",
    "Referer": "http://hismorumbi.rededor.corp/"
  },
  "body": "[]",
  "method": "POST"
}); ;
fetch("http://hismorumbi.rededor.corp/TasyAppServer/resources/service/CommonService/getAttentionLevel", {
  "headers": {
    "accept": "application/json, text/plain, */*",
    "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7,fr;q=0.6",
    "active-feature-code": "281",
    "authorization": "BEARER <BEARER_TOKEN>",
    "content-type": "application/json;charset=UTF-8",
    "crsftoken": "<CSRF_TOKEN>",
    "developer-mode": "false",
    "feature-code": "281",
    "feature-route": "atepaceh",
    "locale-customization": "all",
    "tasybackendversion": "dev",
    "cookie": "JSESSIONID=<JSESSIONID>; TASYAPPSERVER=tasy-tasyapp-2_2; hasPerformedSuccessfulLogin=true; Authorization=BEARER+<BEARER_TOKEN>; NGSESSION=4bb2e54a-404d-4cc9-a163-4f02c68258a1",
    "Referer": "http://hismorumbi.rededor.corp/"
  },
  "body": "[]",
  "method": "POST"
}); ;
fetch("http://hismorumbi.rededor.corp/TasyAppServer/resources/service/CommonService/isAlphanumericProcedure", {
  "headers": {
    "accept": "application/json, text/plain, */*",
    "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7,fr;q=0.6",
    "active-feature-code": "281",
    "authorization": "BEARER <BEARER_TOKEN>",
    "content-type": "application/json;charset=UTF-8",
    "crsftoken": "<CSRF_TOKEN>",
    "developer-mode": "false",
    "locale-customization": "all",
    "tasybackendversion": "dev",
    "cookie": "JSESSIONID=<JSESSIONID>; TASYAPPSERVER=tasy-tasyapp-2_2; hasPerformedSuccessfulLogin=true; Authorization=BEARER+<BEARER_TOKEN>; NGSESSION=4bb2e54a-404d-4cc9-a163-4f02c68258a1",
    "Referer": "http://hismorumbi.rededor.corp/"
  },
  "body": "[]",
  "method": "POST"
}); ;
fetch("http://hismorumbi.rededor.corp/TasyAppServer/resources/public/security/SSO/settings", {
  "headers": {
    "accept": "application/json, text/plain, */*",
    "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7,fr;q=0.6",
    "active-feature-code": "281",
    "crsftoken": "<CSRF_TOKEN>",
    "developer-mode": "false",
    "locale-customization": "all",
    "tasybackendversion": "dev",
    "cookie": "JSESSIONID=<JSESSIONID>; TASYAPPSERVER=tasy-tasyapp-2_2; hasPerformedSuccessfulLogin=true; Authorization=BEARER+<BEARER_TOKEN>; NGSESSION=4bb2e54a-404d-4cc9-a163-4f02c68258a1",
    "Referer": "http://hismorumbi.rededor.corp/"
  },
  "body": null,
  "method": "GET"
}); ;
fetch("http://hismorumbi.rededor.corp/TasyAppServer/resources/public/native/download/detect", {
  "headers": {
    "accept": "*/*",
    "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7,fr;q=0.6",
    "cookie": "JSESSIONID=<JSESSIONID>; TASYAPPSERVER=tasy-tasyapp-2_2; hasPerformedSuccessfulLogin=true; Authorization=BEARER+<BEARER_TOKEN>; NGSESSION=4bb2e54a-404d-4cc9-a163-4f02c68258a1",
    "Referer": "http://hismorumbi.rededor.corp/"
  },
  "body": null,
  "method": "GET"
}); ;
fetch("http://hismorumbi.rededor.corp/TasyAppServer/resources/public/native/download/detect", {
  "headers": {
    "accept": "*/*",
    "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7,fr;q=0.6",
    "cookie": "JSESSIONID=<JSESSIONID>; TASYAPPSERVER=tasy-tasyapp-2_2; hasPerformedSuccessfulLogin=true; Authorization=BEARER+<BEARER_TOKEN>; NGSESSION=4bb2e54a-404d-4cc9-a163-4f02c68258a1",
    "Referer": "http://hismorumbi.rededor.corp/"
  },
  "body": null,
  "method": "GET"
}); ;
fetch("http://hismorumbi.rededor.corp/TasyAppServer/resources/service/WPaciente/obterImagemPaciente", {
  "headers": {
    "accept": "application/json, text/plain, */*",
    "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7,fr;q=0.6",
    "active-feature-code": "281",
    "authorization": "BEARER <BEARER_TOKEN>",
    "content-type": "application/json;charset=UTF-8",
    "crsftoken": "<CSRF_TOKEN>",
    "developer-mode": "false",
    "locale-customization": "all",
    "tasybackendversion": "dev",
    "cookie": "JSESSIONID=<JSESSIONID>; TASYAPPSERVER=tasy-tasyapp-2_2; hasPerformedSuccessfulLogin=true; Authorization=BEARER+<BEARER_TOKEN>; NGSESSION=4bb2e54a-404d-4cc9-a163-4f02c68258a1",
    "Referer": "http://hismorumbi.rededor.corp/"
  },
  "body": "[{\"tipo\":\"LinkedHashMap\",\"valor\":{\"CD_PESSOA_FISICA\":\"6450573\"}}]",
  "method": "POST"
}); ;
fetch("http://hismorumbi.rededor.corp/TasyAppServer/resources/public/security/SSO/settings", {
  "headers": {
    "accept": "application/json, text/plain, */*",
    "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7,fr;q=0.6",
    "active-feature-code": "281",
    "crsftoken": "<CSRF_TOKEN>",
    "developer-mode": "false",
    "locale-customization": "all",
    "tasybackendversion": "dev",
    "cookie": "JSESSIONID=<JSESSIONID>; TASYAPPSERVER=tasy-tasyapp-2_2; hasPerformedSuccessfulLogin=true; Authorization=BEARER+<BEARER_TOKEN>; NGSESSION=4bb2e54a-404d-4cc9-a163-4f02c68258a1",
    "Referer": "http://hismorumbi.rededor.corp/"
  },
  "body": null,
  "method": "GET"
}); ;
fetch("http://hismorumbi.rededor.corp/TasyAppServer/resources/service/WUserGuideProvider/getModalList", {
  "headers": {
    "accept": "application/json, text/plain, */*",
    "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7,fr;q=0.6",
    "active-feature-code": "281",
    "authorization": "BEARER <BEARER_TOKEN>",
    "content-type": "application/json;charset=UTF-8",
    "crsftoken": "<CSRF_TOKEN>",
    "developer-mode": "false",
    "locale-customization": "all",
    "tasybackendversion": "dev",
    "cookie": "JSESSIONID=<JSESSIONID>; TASYAPPSERVER=tasy-tasyapp-2_2; hasPerformedSuccessfulLogin=true; Authorization=BEARER+<BEARER_TOKEN>; NGSESSION=4bb2e54a-404d-4cc9-a163-4f02c68258a1",
    "Referer": "http://hismorumbi.rededor.corp/"
  },
  "body": "[{\"tipo\":\"HashMap\",\"valor\":{\"guideUtilization\":\"T\",\"valueUtilization\":null,\"onlyUnfineshed\":\"S\"}}]",
  "method": "POST"
}); ;
fetch("http://hismorumbi.rededor.corp/TasyAppServer/resources/service/WUserGuideProvider/getModalList", {
  "headers": {
    "accept": "application/json, text/plain, */*",
    "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7,fr;q=0.6",
    "active-feature-code": "281",
    "authorization": "BEARER <BEARER_TOKEN>",
    "content-type": "application/json;charset=UTF-8",
    "crsftoken": "<CSRF_TOKEN>",
    "developer-mode": "false",
    "locale-customization": "all",
    "tasybackendversion": "dev",
    "cookie": "JSESSIONID=<JSESSIONID>; TASYAPPSERVER=tasy-tasyapp-2_2; hasPerformedSuccessfulLogin=true; Authorization=BEARER+<BEARER_TOKEN>; NGSESSION=4bb2e54a-404d-4cc9-a163-4f02c68258a1",
    "Referer": "http://hismorumbi.rededor.corp/"
  },
  "body": "[{\"tipo\":\"HashMap\",\"valor\":{\"guideUtilization\":\"T\",\"valueUtilization\":null,\"onlyUnfineshed\":\"N\"}}]",
  "method": "POST"
}); ;
fetch("http://hismorumbi.rededor.corp/TasyAppServer/resources/service/CorSisTB/extractComponentPermission", {
  "headers": {
    "accept": "application/json, text/plain, */*",
    "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7,fr;q=0.6",
    "active-feature-code": "281",
    "authorization": "BEARER <BEARER_TOKEN>",
    "content-type": "application/json;charset=UTF-8",
    "crsftoken": "<CSRF_TOKEN>",
    "developer-mode": "false",
    "locale-customization": "all",
    "tasybackendversion": "dev",
    "cookie": "JSESSIONID=<JSESSIONID>; TASYAPPSERVER=tasy-tasyapp-2_2; hasPerformedSuccessfulLogin=true; Authorization=BEARER+<BEARER_TOKEN>; NGSESSION=4bb2e54a-404d-4cc9-a163-4f02c68258a1",
    "Referer": "http://hismorumbi.rededor.corp/"
  },
  "body": "[{\"tipo\":\"Map\",\"valor\":{\"NR_SEQUENCIA_P\":\"\"}}]",
  "method": "POST"
}); ;
fetch("http://hismorumbi.rededor.corp/TasyAppServer/resources/public/system/earlyAdopter/identifier", {
  "headers": {
    "accept": "application/json, text/plain, */*",
    "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7,fr;q=0.6",
    "active-feature-code": "281",
    "authorization": "BEARER <BEARER_TOKEN>",
    "crsftoken": "<CSRF_TOKEN>",
    "developer-mode": "false",
    "locale-customization": "all",
    "tasybackendversion": "dev",
    "cookie": "JSESSIONID=<JSESSIONID>; TASYAPPSERVER=tasy-tasyapp-2_2; hasPerformedSuccessfulLogin=true; Authorization=BEARER+<BEARER_TOKEN>; NGSESSION=4bb2e54a-404d-4cc9-a163-4f02c68258a1",
    "Referer": "http://hismorumbi.rededor.corp/"
  },
  "body": null,
  "method": "GET"
}); ;
fetch("http://hismorumbi.rededor.corp/TasyAppServer/resources/service/WParameter/getParameter", {
  "headers": {
    "accept": "application/json, text/plain, */*",
    "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7,fr;q=0.6",
    "active-feature-code": "281",
    "authorization": "BEARER <BEARER_TOKEN>",
    "content-type": "application/json;charset=UTF-8",
    "crsftoken": "<CSRF_TOKEN>",
    "developer-mode": "false",
    "locale-customization": "all",
    "tasybackendversion": "dev",
    "cookie": "JSESSIONID=<JSESSIONID>; TASYAPPSERVER=tasy-tasyapp-2_2; hasPerformedSuccessfulLogin=true; Authorization=BEARER+<BEARER_TOKEN>; NGSESSION=4bb2e54a-404d-4cc9-a163-4f02c68258a1",
    "Referer": "http://hismorumbi.rededor.corp/"
  },
  "body": "[{\"tipo\":\"Integer\",\"valor\":0},{\"tipo\":\"Integer\",\"valor\":239}]",
  "method": "POST"
}); ;
fetch("http://hismorumbi.rededor.corp/TasyAppServer/resources/service/CorSisF1/getInformativeMessagesAction", {
  "headers": {
    "accept": "application/json, text/plain, */*",
    "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7,fr;q=0.6",
    "active-feature-code": "281",
    "authorization": "BEARER <BEARER_TOKEN>",
    "content-type": "application/json;charset=UTF-8",
    "crsftoken": "<CSRF_TOKEN>",
    "developer-mode": "false",
    "locale-customization": "all",
    "tasybackendversion": "dev",
    "cookie": "JSESSIONID=<JSESSIONID>; TASYAPPSERVER=tasy-tasyapp-2_2; hasPerformedSuccessfulLogin=true; Authorization=BEARER+<BEARER_TOKEN>; NGSESSION=4bb2e54a-404d-4cc9-a163-4f02c68258a1",
    "Referer": "http://hismorumbi.rededor.corp/"
  },
  "body": "[{\"tipo\":\"HashMap\",\"valor\":{\"CD_ESTABELECIMENTO\":14}}]",
  "method": "POST"
}); ;
fetch("http://hismorumbi.rededor.corp/TasyAppServer/resources/service/WSignature/setup", {
  "headers": {
    "accept": "application/json, text/plain, */*",
    "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7,fr;q=0.6",
    "active-feature-code": "281",
    "authorization": "BEARER <BEARER_TOKEN>",
    "content-type": "application/json;charset=UTF-8",
    "crsftoken": "<CSRF_TOKEN>",
    "developer-mode": "false",
    "locale-customization": "all",
    "tasybackendversion": "dev",
    "cookie": "JSESSIONID=<JSESSIONID>; TASYAPPSERVER=tasy-tasyapp-2_2; hasPerformedSuccessfulLogin=true; Authorization=BEARER+<BEARER_TOKEN>; NGSESSION=4bb2e54a-404d-4cc9-a163-4f02c68258a1",
    "Referer": "http://hismorumbi.rededor.corp/"
  },
  "body": "[]",
  "method": "POST"
}); ;
fetch("http://hismorumbi.rededor.corp/TasyAppServer/resources/service/CorSisF1/getActivePrivacyPolicy", {
  "headers": {
    "accept": "application/json, text/plain, */*",
    "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7,fr;q=0.6",
    "active-feature-code": "281",
    "authorization": "BEARER <BEARER_TOKEN>",
    "content-type": "application/json;charset=UTF-8",
    "crsftoken": "<CSRF_TOKEN>",
    "developer-mode": "false",
    "locale-customization": "all",
    "tasybackendversion": "dev",
    "cookie": "JSESSIONID=<JSESSIONID>; TASYAPPSERVER=tasy-tasyapp-2_2; hasPerformedSuccessfulLogin=true; Authorization=BEARER+<BEARER_TOKEN>; NGSESSION=4bb2e54a-404d-4cc9-a163-4f02c68258a1",
    "Referer": "http://hismorumbi.rededor.corp/"
  },
  "body": "[]",
  "method": "POST"
}); ;
fetch("http://hismorumbi.rededor.corp/TasyAppServer/resources/user/getEndedLogoff", {
  "headers": {
    "accept": "application/json, text/plain, */*",
    "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7,fr;q=0.6",
    "active-feature-code": "281",
    "authorization": "BEARER <BEARER_TOKEN>",
    "crsftoken": "<CSRF_TOKEN>",
    "developer-mode": "false",
    "locale-customization": "all",
    "tasybackendversion": "dev",
    "cookie": "JSESSIONID=<JSESSIONID>; TASYAPPSERVER=tasy-tasyapp-2_2; hasPerformedSuccessfulLogin=true; Authorization=BEARER+<BEARER_TOKEN>; NGSESSION=4bb2e54a-404d-4cc9-a163-4f02c68258a1",
    "Referer": "http://hismorumbi.rededor.corp/"
  },
  "body": null,
  "method": "GET"
}); ;
fetch("http://hismorumbi.rededor.corp/TasyAppServer/resources/service/WParameter/getParameter", {
  "headers": {
    "accept": "application/json, text/plain, */*",
    "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7,fr;q=0.6",
    "active-feature-code": "281",
    "authorization": "BEARER <BEARER_TOKEN>",
    "content-type": "application/json;charset=UTF-8",
    "crsftoken": "<CSRF_TOKEN>",
    "developer-mode": "false",
    "locale-customization": "all",
    "tasybackendversion": "dev",
    "cookie": "JSESSIONID=<JSESSIONID>; TASYAPPSERVER=tasy-tasyapp-2_2; hasPerformedSuccessfulLogin=true; Authorization=BEARER+<BEARER_TOKEN>; NGSESSION=4bb2e54a-404d-4cc9-a163-4f02c68258a1",
    "Referer": "http://hismorumbi.rededor.corp/"
  },
  "body": "[{\"tipo\":\"Integer\",\"valor\":0},{\"tipo\":\"Integer\",\"valor\":241}]",
  "method": "POST"
}); ;
fetch("http://hismorumbi.rededor.corp/TasyAppServer/resources/service/WNotification/getWebSocketServerUrl", {
  "headers": {
    "accept": "application/json, text/plain, */*",
    "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7,fr;q=0.6",
    "active-feature-code": "281",
    "authorization": "BEARER <BEARER_TOKEN>",
    "content-type": "application/json;charset=UTF-8",
    "crsftoken": "<CSRF_TOKEN>",
    "developer-mode": "false",
    "locale-customization": "all",
    "tasybackendversion": "dev",
    "cookie": "JSESSIONID=<JSESSIONID>; TASYAPPSERVER=tasy-tasyapp-2_2; hasPerformedSuccessfulLogin=true; Authorization=BEARER+<BEARER_TOKEN>; NGSESSION=4bb2e54a-404d-4cc9-a163-4f02c68258a1",
    "Referer": "http://hismorumbi.rededor.corp/"
  },
  "body": "[]",
  "method": "POST"
});
```


### Alterar unidade/estabelecimento

```
fetch("http://hismorumbi.rededor.corp/TasyAppServer/resources/service/CorSis_FK/performAction", {
  "headers": {
    "accept": "application/json, text/plain, */*",
    "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7,fr;q=0.6",
    "active-feature-code": "3003",
    "authorization": "BEARER <BEARER_TOKEN>",
    "content-type": "application/json;charset=UTF-8",
    "crsftoken": "<CSRF_TOKEN>",
    "developer-mode": "false",
    "locale-customization": "all",
    "tasybackendversion": "dev",
    "cookie": "JSESSIONID=<JSESSIONID>; TASYAPPSERVER=tasy-tasyapp-2_2; hasPerformedSuccessfulLogin=true; Authorization=BEARER+<BEARER_TOKEN>; NGSESSION=80066ce7-6753-4a9b-b43b-c105fed412fe",
    "Referer": "http://hismorumbi.rededor.corp/"
  },
  "body": "[{\"tipo\":\"HashMap\",\"valor\":{\"CD\":68,\"IS_DEFAULT_ESTAB\":false}}]",
  "method": "POST"
});
```

### Alterar perfil

```
fetch("http://hismorumbi.rededor.corp/TasyAppServer/resources/user/profile", {
  "headers": {
    "accept": "application/json, text/plain, */*",
    "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7,fr;q=0.6",
    "active-feature-code": "3003",
    "authorization": "BEARER <BEARER_TOKEN>",
    "content-type": "application/json;charset=UTF-8",
    "crsftoken": "<CSRF_TOKEN>",
    "developer-mode": "false",
    "locale-customization": "all",
    "tasybackendversion": "dev",
    "cookie": "JSESSIONID=<JSESSIONID>; TASYAPPSERVER=tasy-tasyapp-2_2; hasPerformedSuccessfulLogin=true; Authorization=BEARER+<BEARER_TOKEN>; NGSESSION=80066ce7-6753-4a9b-b43b-c105fed412fe",
    "Referer": "http://hismorumbi.rededor.corp/"
  },
  "body": "{\"profile\":1949,\"changingProfile\":true}",
  "method": "POST"
});
```


### Gerar relatório

Neste fetch, os argumentos dependem do relatório. 

```
fetch("http://hismorumbi.rededor.corp/TasyAppServer/resources/service/Report/generateReports", {
  "headers": {
    "accept": "application/json, text/plain, */*",
    "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7,fr;q=0.6",
    "active-feature-code": "3003",
    "authorization": "BEARER <BEARER_TOKEN>",
    "content-type": "application/json;charset=UTF-8",
    "crsftoken": "<CSRF_TOKEN>",
    "developer-mode": "false",
    "feature-code": "3003",
    "feature-route": "corsisfs",
    "locale-customization": "all",
    "tasybackendversion": "dev",
    "cookie": "JSESSIONID=<JSESSIONID>; TASYAPPSERVER=tasy-tasyapp-2_2; hasPerformedSuccessfulLogin=true; Authorization=BEARER+<BEARER_TOKEN>; NGSESSION=80066ce7-6753-4a9b-b43b-c105fed412fe",
    "Referer": "http://hismorumbi.rededor.corp/"
  },
  "body": "[{\"@class\":\"br.com.philips.tasy.dto.shared.report.ReportsParam\",\"reports\":[{\"@class\":\"br.com.philips.tasy.dto.shared.report.ReportParam\",\"title\":\"RDSL - Produtividade recepções/Fast Check-in - Excel\",\"type\":\"CATE\",\"code\":61138,\"parameters\":{\"fileExportType\":\"XLS\",\"IE_TIPO_ATENDIMENTO\":\"7\",\"DT_FINAL\":{\"@class\":\"java.time.Instant\",\"type\":\"INSTANT\",\"value\":\"2026-07-01T03:00:00.000Z\"},\"DESCRICAO_FILTRO_SQL_WHERE\":\"Tipo Atendimento: Externo\",\"_nrSeqSchematicsFeature\":1254,\"ADVF_DIMENSIONS\":[{\"conditional\":{\"code\":\"1186942\"},\"totalSelected\":\"1\",\"values\":[\"7\"],\"isNotEqualTo\":\"false\",\"isAll\":\"false\",\"dimension\":{\"code\":\"0\"},\"dimensionField\":\"IE_TIPO_ATENDIMENTO\"}],\"DT_INICIAL\":{\"@class\":\"java.time.Instant\",\"type\":\"INSTANT\",\"value\":\"2026-07-01T03:00:00.000Z\"}},\"actionClass\":\"\",\"customPreview\":\"\",\"customGenerate\":false,\"configure\":\"N\",\"kind\":\"EXCEL\",\"sequenceId\":\"2883918\",\"printedCopies\":1,\"duplexPrinting\":\"N\",\"usingSectorPrinters\":false,\"showMessage\":false,\"printSetup\":false,\"showParameters\":false,\"tray\":0,\"sharedParameter\":false,\"useDigitalSign\":false,\"internalUseDigitalSign\":false,\"paperSize\":\"A4\"}],\"printersAvailable\":[],\"defaultPrinter\":null,\"fileList\":[],\"localStoragePrinterName\":null},{\"tipo\":\"Boolean\",\"valor\":false},{\"tipo\":\"Integer\"},{\"tipo\":\"String\",\"valor\":\"XLS\"},{\"tipo\":\"String\",\"valor\":\"\"},{\"tipo\":\"boolean\",\"valor\":true},{\"tipo\":\"HashMap\",\"valor\":{}},{\"tipo\":\"String\",\"valor\":\"\"}]",
  "method": "POST"
});
```

No código, o preenchimento do body estará associado a um cadastro do relatório. Para facilitar o preenchimento desse cadastro, se encarregue de gerar criar um gerador de registro que receberá o fetch do getReportsData (exemplo a seguir) para gerar um registro do relatório.

```
fetch("http://hismorumbi.rededor.corp/TasyAppServer/resources/service/Report/getReportsData", {
  "headers": {
    "accept": "application/json, text/plain, */*",
    "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7,fr;q=0.6",
    "active-feature-code": "3003",
    "authorization": "BEARER <BEARER_TOKEN>",
    "content-type": "application/json;charset=UTF-8",
    "crsftoken": "<CSRF_TOKEN>",
    "developer-mode": "false",
    "feature-code": "3003",
    "feature-route": "corsisfs",
    "locale-customization": "all",
    "tasybackendversion": "dev",
    "cookie": "JSESSIONID=<JSESSIONID>; TASYAPPSERVER=tasy-tasyapp-2_2; hasPerformedSuccessfulLogin=true; Authorization=BEARER+<BEARER_TOKEN>; NGSESSION=80066ce7-6753-4a9b-b43b-c105fed412fe",
    "Referer": "http://hismorumbi.rededor.corp/"
  },
  "body": "[{\"@class\":\"br.com.philips.tasy.dto.shared.report.ReportsParam\",\"reports\":[{\"@class\":\"br.com.philips.tasy.dto.shared.report.ReportParam\",\"type\":\"CATE\",\"code\":61138,\"parameters\":{\"_nrSeqSchematicsFeature\":1254,\"DT_INICIAL\":{\"@class\":\"java.time.Instant\",\"type\":\"INSTANT\",\"value\":\"2026-07-01T03:00:00.000Z\"},\"DT_FINAL\":{\"@class\":\"java.time.Instant\",\"type\":\"INSTANT\",\"value\":\"2026-07-01T03:00:00.000Z\"},\"IE_TIPO_ATENDIMENTO\":\"7\",\"CD_SETOR_ATENDIMENTO\":null,\"ADVF_DIMENSIONS\":[{\"dimension\":{\"code\":\"0\"},\"values\":[\"7\"],\"isAll\":\"false\",\"isNotEqualTo\":\"false\",\"conditional\":{\"code\":\"1186942\"},\"totalSelected\":\"1\",\"dimensionField\":\"IE_TIPO_ATENDIMENTO\"}],\"DESCRICAO_FILTRO_SQL_WHERE\":\"Tipo Atendimento: Externo\"},\"actionClass\":\"\",\"customPreview\":\"\",\"configure\":\"N\",\"customGenerate\":false,\"printedCopies\":1,\"duplexPrinting\":\"N\"}]},{\"tipo\":\"String\",\"valor\":\"\"}]",
  "method": "POST"
});
```