'use babel';

export default class Url {

  validUrl(str) {
    const exp = new RegExp(/[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/);
    return str.match(exp);
  }

  hasProtocol(str) {
    const exp = new RegExp(/^(http|https|file):\/\//);
    return str.match(exp);
  }

  removeProtocol(str) {
    const exp = new RegExp(/^(http|https|file):\/\//);
    return str.replace(exp, "");
  }

  parse(str) {
    const protocol = this.hasProtocol(str);
    const valid = this.validUrl(str);
    if ( protocol && valid ) {
      return {url: str, protocol: protocol[0].replace("://", "")};
    } else if (valid) {
      return {url: "http://" + str, protocol: "http"};
    } else {
      return {url: `https://www.google.com/search?q=${str}`, protocol: "https"};
    }
  }

}
