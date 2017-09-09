/* global localStorage */
/* global fetch */
import uuidv4 from 'uuid/v4'
import * as mo from 'moment'
import validator from 'validator'

const cfg = (key) => {
  const data = {
    url: 'https://api.blockkeeper.io/v1',
    maxChar: 30
  }
  return key == null ? data : data[key]
}

class AppError extends Error {
  constructor (umsg, {e, lbl, dmsg, sts, ...more} = {}) {
    super(umsg)
    try {
      Error.captureStackTrace(this, this.constructor)
    } catch (err) {
      // firefox is bitchy
      // console.warn('Capturing error stacktrace failed')
    }
    this.name = this.constructor.name
    this.isAppErr = true
    this.lbl = lbl                              // label
    this.paErr = e                              // parent error
    this.message = umsg                         // user message
    this.dmsg = dmsg                            // developer message
    this.sts = sts || (e || {}).sts || 0        // status code
    this.more = more                            // additional data
    const moreKeys = Object.keys(more)
    if (moreKeys.length > 0) {
      for (let key of moreKeys) this[`_${key}`] = more[key]
    }
  }
}

const getErr = (...args) => {
  const e = new AppError(...args)
  let d = [
    e.name.toUpperCase() +
    (e.lbl ? ` [${e.lbl}]:  ` : ':  ') +
    e.message +
    (e.dmsg ? ` -> ${e.dmsg}` : '')
  ]
  if (e.sts) d[0] += ` -> ${e.sts}`
  if (e.paErr) d.push({parentError: e.paErr})
  if (e.more) d.push(e.more)
  console.warn(...d)
  return e
}

const getLogger = (ilk, lbl) => {
  const func = ilk === 'warn' ? console.warn : console.log
  ilk = ilk.toUpperCase()
  return (...args) => {
    if (typeof args[0] === 'string') {
      args[0] = ilk + (lbl ? ` [${lbl}]:  ` : ':  ') + args[0]
    }
    func.apply(console, args)
  }
}

const toLbl = (mainType, subType, _id, paLbl) => {
  let lbl = mainType + ':' + subType.slice(0, 15)
  if (_id) lbl += '_' + _id.slice(0, 15)
  if (paLbl) lbl += '.' + paLbl.replace(mainType + ':', '')
  return lbl
}

const init = (mainType, subType, _id, pa) => {
  const d = {
    _id: _id || uuidv4(),
    _type: [mainType.toLowerCase(), subType.toLowerCase()],
    _t: mo.utc().format()
  }
  d._store = d._type[1] + '_' + d._id
  if (pa != null) d._pa = pa
  d._lbl = toLbl(d._type[0], d._type[1], d._id, (pa || {})._lbl)
  d.info = getLogger('info', d._lbl)
  d.warn = getLogger('warn', d._lbl)
  d.err = (umsg, kwargs = {}) => getErr(umsg, {...kwargs, lbl: d._lbl})
  return d
}

async function rqst (rqstObj) {
  let e
  let rsp
  try {
    rsp = await fetch(rqstObj)
  } catch (e) {}
  rsp = rsp || {}
  let sts = rsp.status || 600
  if (sts === 200) {
    try {
      return rsp.json()
    } catch (e) {
      sts = 601
    }
  }
  let err
  let umsg
  try {
    err = await rsp.json()
  } catch (e) {
    err = {}
  }
  if (sts === 404) {
    umsg = `${urlToRsrc(rqstObj.url)} not found`
  } else {
    umsg = `Requesting ${urlToRsrc(rqstObj.url)} failed: ` +
      ((sts >= 400 && sts < 500) ? 'Invalid input' : 'API error')
  }
  throw this.err(umsg, {e, sts, err, rqstObj, rqstRsp: rsp})
}

// mock promise
const toMoPro = (data, tmoMsec, ...args) => {
  // catch "...args" to satisfy IDE linter only
  return new Promise((resolve, reject) => {
    setTimeout(() => resolve(data), tmoMsec)
  })
}

const ppTme = _t => {
  let tme = mo(_t)
  return tme.fromNow()
}

const vldAlphNum = (val, {strict, noSpace, min, max} = {}) => {
  let pat = 'a-zA-Z0-9'
  let msg = 'Allowed characters: '
  if (strict) {
    msg += pat
  } else {
    pat += ':,.-_'
    if (noSpace) {
      msg += pat
    } else {
      pat += ' '
      msg += `Space and ${pat}`
    }
  }
  if (!validator.matches(val, `^[${pat}]*$`)) return msg
  min = min || 0
  if (val.length < min) return `Min length: ${min} characters`
  max = max || cfg('maxChar')
  if (val.length > max) return `Max length: ${max} characters`
  return ''
}

const vldFloat = (val, max) => {
  return validator.isFloat(val, {min: 0, max: max || 9999999999})
    ? ''
    : 'Not a float (e.g. 1.23) or value to small/big'
}

const getSnack = () => {
  let msg = getSto('snack')
  delSto('snack')
  return msg
}

const urlToRsrc = (url) => {
  let rsrc = url.split('/')[4] || 'resource'
  // rsrc = rsrc.charAt(0).toUpperCase() + rsrc.slice(1)
  return rsrc
}

const getStos = (term, convert) => {
  let stos = []
  for (let sto of Object.keys(localStorage)) {
    if (sto.startsWith(term)) stos.push(convert ? convert(sto) : sto)
  }
  return stos
}

const getStoIds = term => {
  return Array.from(new Set(getStos(term, (sto) => sto.split('_')[1])))
}

// TODO: generate real secret
const toSecret = (user, pw) => user + ':' + pw

const getSto = key => localStorage.getItem(key)

const setSto = (key, pld) => {
  localStorage.setItem(key, pld)
  // localStorage.setItem(`last_${key}`, mo.utc().format())
}

const delSto = key => {
  localStorage.removeItem(key)
  // localStorage.removeItem(`last_${key}`)
}

const getJsonSto = key => {
  const warn = getLogger('warn', 'main')
  try {
    return JSON.parse(localStorage.getItem(key))
  } catch (e) {
    warn('Getting "%s" from storage failed:', key, e)
  }
}

const setJsonSto = (key, pld) => {
  const warn = getLogger('warn', 'main')
  try {
    localStorage.setItem(key, JSON.stringify(pld))
    // localStorage.setItem(`last_${key}`, mo.utc().format())
  } catch (e) {
    warn('Saving "%s" to storage failed:', key, e)
  }
}

const setSecSto = (user, secret) => {
  setSto('user', user)
  setSto('secret', secret)
}

export default {
  cfg,
  getStos,
  getStoIds,
  getSto,
  setSto,
  delSto,
  getJsonSto,
  setJsonSto,
  delJsonSto: delSto,
  getSecSto: () => getSto('secret'),
  delSecSto: () => delSto('secret'),
  getCoinPair: (baseCoin, quoteCoin) => `${baseCoin}_${quoteCoin}`,
  getTme: () => mo.utc().format(),
  addSnack: (msg) => setSto('snack', msg),
  getSnack,
  setSecSto,
  urlToRsrc,
  rqst,
  ppTme,
  toSecret,
  getLogger,
  toLbl,
  init,
  toMoPro,
  err: getErr,
  info: getLogger('info', 'main'),
  warn: getLogger('warn', 'main'),
  uuid: uuidv4,
  vld: validator,
  vldAlphNum,
  vldFloat
}

/*
// doesn't work reliable :(
const addTabWatcher = () => {
  const info = getLogger('info', 'main')
  info('Registering browser tab watcher')

  const update = idle => {
    let title = document.title.replace(' [Idle]', '')
    if (idle) {
      localStorage.setItem('active', false)
      document.title = title + ' [Idle]'
    } else {
      localStorage.setItem('active', true)
      document.title = title
    }
  }

  // window.onfocus = () => {
  //   info('Browser tab is active')
  //   update(false)
  // }
  // window.onblur = function () {
  //   info('Browser tab is idle')
  //   update(true)
  // }

  let key, prop
  if (typeof document.hidden !== undefined) {
    key = 'visibilitychange'
    prop = 'hidden'
  } else if (typeof document.mozHidden !== 'undefined') {
    key = 'mozvisibilitychange'
    prop = 'mozHidden'
  } else if (typeof document.msHidden !== 'undefined') {
    key = 'msvisibilitychange'
    prop = 'msHidden'
  } else if (typeof document.webkitHidden !== 'undefined') {
    key = 'webkitvisibilitychange'
    prop = 'webkitHidden'
  }
  document.addEventListener(
    key,
    () => {
      if (document[prop]) {
        info('Browser tab is idle')
        update()
      } else {
        info('Browser tab is active')
        update(false)
      }
    }
  )
}
*/
