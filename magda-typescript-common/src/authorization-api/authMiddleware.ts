import { Request, Response, NextFunction } from "express";
import { getUserId as getUserIdFromReq } from "../session/GetUserId";
import ApiClient from "./ApiClient";
import AuthDecisionQueryClient, {
    AuthDecisionReqConfig
} from "../opa/AuthDecisionQueryClient";
import AuthDecision, { isTrueEquivalent } from "../opa/AuthDecision";
import { DEFAULT_ADMIN_USER_ID, ADMIN_USERS_ROLE_ID } from "./constants";
import ServerError from "../ServerError";

/**
 * Find the user making the request. Assign it to req passport style.
 * !deprecated! should use middleware `getUserId` or `requireUserId` instead.
 */
export const getUser = (
    baseAuthUrl: string,
    jwtSecret: string,
    actionUserId?: string
) => (req: Request, res: Response, next: () => void) => {
    getUserIdFromReq(req, jwtSecret).caseOf({
        just: (userId) => {
            const apiClient = new ApiClient(
                baseAuthUrl,
                jwtSecret,
                actionUserId ? actionUserId : DEFAULT_ADMIN_USER_ID
            );
            apiClient
                .getUser(userId)
                .then((maybeUser) => {
                    maybeUser.caseOf({
                        just: (user) => {
                            req.user = {
                                // the default session data type is UserToken
                                // But any auth plugin provider could choose to customise the session by adding more fields
                                // avoid losing customise session data here
                                ...(req.user ? req.user : {}),
                                ...user
                            };
                            next();
                        },
                        nothing: next
                    });
                })
                .catch(() => next());
        },
        nothing: next
    });
};

// deprecated middleware. To be removed after all code is secured with new model
export const mustBeAdmin = (baseAuthUrl: string, jwtSecret: string) => {
    const getUserInstance = getUser(baseAuthUrl, jwtSecret);
    return (req: Request, res: Response, next: () => void) => {
        getUserInstance(req, res, async () => {
            try {
                // check the legacy `isAdmin` role
                if (req?.user?.isAdmin) {
                    next();
                    return;
                } else if (req?.user?.id) {
                    const msg403 =
                        "Only admin users are authorised to access this API: " +
                        req.url;
                    const apiClient = new ApiClient(
                        baseAuthUrl,
                        jwtSecret,
                        DEFAULT_ADMIN_USER_ID
                    );
                    const roles = await apiClient.getUserRoles(req.user.id);
                    if (!roles?.length) {
                        throw new ServerError(msg403, 403);
                    }
                    if (
                        roles.findIndex(
                            (role) => role.id === ADMIN_USERS_ROLE_ID
                        ) !== -1
                    ) {
                        next();
                        return;
                    } else {
                        throw new ServerError(msg403, 403);
                    }
                } else {
                    throw new ServerError("Not authorized", 401);
                }
            } catch (e) {
                if (e instanceof ServerError) {
                    console.warn(`Rejecting by mustBeAdmin: ${e}`);
                    res.status(e.statusCode).send(e.message);
                } else {
                    res.status(500).send(`${e}`);
                }
            }
        });
    };
};

export type AuthDecisionReqConfigOrConfigFuncParam =
    | AuthDecisionReqConfig
    | ((
          req: Request,
          res: Response,
          next: NextFunction
      ) =>
          | AuthDecisionReqConfig
          | null
          | Promise<AuthDecisionReqConfig | null>);

/**
 * Make auth decision based on auth decision request config.
 * Depends on the config provided, either partial eval (conditional decision on a set of records/objects)
 * Or unconditional decision for a single record / object will be returned via `res.locals.authDecision`.
 *
 * @export
 * @param {AuthDecisionQueryClient} authDecisionClient
 * @param {AuthDecisionReqConfigOrConfigFuncParam} configOrConfigFunc An auth decision config object or a function returns an auth decision config object.
 * When a function is supplied, the function can opt to:
 * - return an auth decision object based on incoming request.
 * - throw an Error
 * - send the response and return a `null` value to skip the rest of request processing.
 * - call `next` function and return a `null` value to skip the rest of processing of current middleware
 * @return {*}
 */
export function withAuthDecision(
    authDecisionClient: AuthDecisionQueryClient,
    configOrConfigFunc: AuthDecisionReqConfigOrConfigFuncParam
) {
    return async (req: Request, res: Response, next: () => void) => {
        try {
            const config =
                typeof configOrConfigFunc === "function"
                    ? await configOrConfigFunc(req, res, next)
                    : configOrConfigFunc;
            if (!config) {
                return;
            }
            const jwtToken = config?.jwtToken
                ? config.jwtToken
                : req.get("X-Magda-Session");
            const authDecision = await authDecisionClient.getAuthDecision(
                config,
                jwtToken
            );
            res.locals.authDecision = authDecision;
            res.locals.authDecisionConfig = config;
            next();
        } catch (e) {
            console.error(`withAuthDecision middleware error: ${e}`);
            if (e instanceof ServerError) {
                res.status(e.statusCode).send(e.message);
            } else {
                res.status(500).send(
                    `An error occurred while retrieving auth decision for the request: ${e}`
                );
            }
        }
    };
}

/**
 * Require unconditional auth decision based on auth decision request config.
 * When making decision on a group of records/objects, this method makes sure
 * the user has permission to all records/objects regardless individual record / object's attributes.
 *
 * @export
 * @param {AuthDecisionQueryClient} authDecisionClient
 * @param {AuthDecisionReqConfigOrConfigFuncParam} configOrConfigFunc
 * @param {boolean} [requiredDecision=true]
 * @return {*}
 */
export function requireUnconditionalAuthDecision(
    authDecisionClient: AuthDecisionQueryClient,
    configOrConfigFunc: AuthDecisionReqConfigOrConfigFuncParam,
    requiredDecision: boolean = true
) {
    return (req: Request, res: Response, next: () => void) => {
        withAuthDecision(authDecisionClient, configOrConfigFunc)(
            req,
            res,
            () => {
                const authDecision = res.locals.authDecision as AuthDecision;
                if (
                    authDecision?.hasResidualRules === false &&
                    isTrueEquivalent(authDecision?.result) == requiredDecision
                ) {
                    return next();
                } else {
                    res.status(403).send(
                        `you are not permitted to perform \`${res?.locals?.authDecisionConfig?.operationUri}\` on required resources.`
                    );
                }
            }
        );
    };
}

type InputDataOrFuncType =
    | ((req: Request, res: Response) => Record<string, any>)
    | Record<string, any>;

/**
 * require permission based on input data provided.
 * Different from withAuthDecision, its method always set `unknowns` = Nil i.e. it will always attempt to make unconditional decision.
 * It's for make decision for one single record / object. For partial eval for a set of records / objects, please use `withAuthDecision` or `requireUnconditionalAuthDecision`
 *
 * @export
 * @param {AuthDecisionQueryClient} authDecisionClient
 * @param {string} operationUri
 * @param {InputDataOrFuncType} [inputDataFunc] either a function that produce input data (auth decision context data) from `req` & `req` or a plain object
 * @return {*}
 */
export function requirePermission(
    authDecisionClient: AuthDecisionQueryClient,
    operationUri: string,
    inputDataOrFunc?: InputDataOrFuncType
) {
    return (req: Request, res: Response, next: () => void) => {
        try {
            const config = {
                operationUri,
                unknowns: []
            } as AuthDecisionReqConfig;
            if (inputDataOrFunc) {
                if (typeof inputDataOrFunc === "function") {
                    config.input = inputDataOrFunc(req, res);
                } else {
                    config.input = inputDataOrFunc;
                }
            }
            requireUnconditionalAuthDecision(authDecisionClient, config, true)(
                req,
                res,
                next
            );
        } catch (e) {
            console.error(`requirePermission middleware error: ${e}`);
            if (e instanceof ServerError) {
                res.status(e.statusCode).send(e.message);
            } else {
                res.status(500).send(
                    `requirePermission middleware error: ${e}`
                );
            }
        }
    };
}

/**
 * Try to locate userId from JwtToken.
 * If can't find JWT token, return undefined via `res.locals.userId`
 *
 * @export
 * @param {Request} req
 * @param {Response} res
 * @param {() => void} next
 */
export function getUserId(jwtSecret: string) {
    return (req: Request, res: Response, next: () => void) => {
        getUserIdFromReq(req, jwtSecret).caseOf({
            just: (userId) => {
                res.locals.userId = userId;
                next();
            },
            nothing: () => {
                res.locals.userId = undefined;
                next();
            }
        });
    };
}

/**
 * get current user ID from JWT token
 * If can't locate userId, response 403 error
 *
 * @export
 * @param {Request} req
 * @param {Response} res
 * @param {() => void} next
 */
export const requireUserId = (jwtSecret: string) => (
    req: Request,
    res: Response,
    next: () => void
) =>
    getUserId(jwtSecret)(req, res, () => {
        if (!res.locals.userId) {
            res.status(403).send(
                "Anonymous users access are not permitted: userId is required."
            );
        } else {
            return next();
        }
    });
