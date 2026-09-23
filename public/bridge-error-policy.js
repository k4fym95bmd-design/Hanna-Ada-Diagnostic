// Pure bridge error policy for the browser workbench.
// Keeps reachability distinct from authorization and physical cable state.
export function classifyBridgeFailure(error = {}) {
  const status = Number(error?.httpStatus);
  const hasHttpStatus = Number.isInteger(status) && status >= 100 && status <= 599;
  const recoverableClientError = hasHttpStatus
    && status >= 400 && status < 500
    && ![401, 403].includes(status);

  return Object.freeze({
    httpStatus: hasHttpStatus ? status : null,
    bridgeReachable: recoverableClientError,
    preservePhysicalState: recoverableClientError,
    authorizationRejected: status === 401 || status === 403,
    transportUnknown: !recoverableClientError,
  });
}
