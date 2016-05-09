import { FlowRouter as ReactionRouter } from "meteor/kadira:flow-router-ssr";
import { BlazeLayout } from "meteor/kadira:blaze-layout";
import { Packages, Shops } from "/lib/collections";
import { MetaData } from "/lib/api/router/metadata";

// server can defer loading\
ReactionRouter.setDeferScriptLoading(true);

/**
 * checkRouterPermissions
 * check if user has route permissions
 * @param  {Object} context - route context
 * @param  {redirect} null object
 * @return {Object} return context
 */
function checkRouterPermissions(context) {
  const routeName = context.route.name;
  if (Reaction.hasPermission(routeName, Meteor.userId())) {
    if (context.unauthorized === true) {
      delete context.unauthorized;
      return context;
    }
    return context;
  }
  // determine if this is a valid route or a 404
  const routeExists = _.find(ReactionRouter._routes, function (route) {
    return route.path === context.path;
  });

  // if route exists (otherwise this will return 404)
  // return unauthorized flag on context
  if (routeExists) {
    context.unauthorized = true;
  }
  return context;
}

// initialize title and meta data and check permissions
ReactionRouter.triggers.enter([checkRouterPermissions, MetaData.init]);

/**
 * getRouteName
 * assemble route name to be standard
 * prefix/package name + registry name or route
 * @param  {String} packageName  [package name]
 * @param  {Object} registryItem [registry object]
 * @return {String}              [route name]
 */
function getRegistryRouteName(packageName, registryItem) {
  let routeName;
  if (packageName && registryItem) {
    if (registryItem.name) {
      routeName = registryItem.name;
    } else if (registryItem.template) {
      routeName = `${packageName}/${registryItem.template}`;
    } else {
      routeName = packageName;
    }
    // dont include params in the name
    routeName = routeName.split(":")[0];
    return routeName;
  }
};

/**
 * selectLayout
 * @param {Object} layout - element of shops.layout array
 * @param {Object} setLayout - layout
 * @param {Object} setWorkflow - workflow
 * @returns {Object} layout - return object of template definitions for Blaze Layout
 */
function selectLayout(layout, setLayout, setWorkflow) {
  const currentLayout = setLayout || "coreLayout";
  const currentWorkflow = setWorkflow || "coreWorkflow";
  if (layout.layout === currentLayout && layout.workflow === currentWorkflow && layout.enabled === true) {
    return layout;
  }
};

/**
 * ReactionLayout
 * sets and returns reaction layout structure
 * @param {Object} context - this router context
 * @param {String} options.layout - string of shop.layout.layout (defaults to coreLayout)
 * @param {String} options.workflow - string of shop.layout.workflow (defaults to coreLayout)
 * @param {String} options - layout.structure overrides
 * @returns {Obj
 * ect} layout - return object of template definitions for Blaze Layout
 */
export function ReactionLayout(options = {}) {
  const layout = options.layout || "coreLayout";
  const workflow = options.workflow || "coreWorkflow";
  if (!options.layout) {
    options.layout = "coreLayout";
  }
  if (!options.workflow) {
    options.workflow = "coreWorkflow";
  }

  // check if router has denied permissions
  // see: checkRouterPermissions
  let unauthorized = {};
  if (ReactionRouter.current().unauthorized) {
    unauthorized.template = "unauthorized";
  }

  // autorun router rendering
  Tracker.autorun(function () {
    if (Reaction.Subscriptions.Shops.ready()) {
      const shop = Shops.findOne(Reaction.getShopId());
      if (shop) {
        const newLayout = shop.layout.find((x) => selectLayout(x, layout, workflow));
        // oops this layout wasn't found. render notFound
        if (!newLayout) {
          BlazeLayout.render("notFound");
        } else {
          const layoutToRender = Object.assign({}, newLayout.structure, options, unauthorized);
          BlazeLayout.render(layout, layoutToRender);
        }
      }
    }
  });
  return options;
}

// default not found route
ReactionRouter.notFound = {
  action() {
    ReactionLayout({
      template: "notFound"
    });
  }
};

/**
 * initPackageRoutes
 * registers route and template when registry item has
 * registryItem.route && registryItem.template
 * @param {String} userId - userId
 * @returns {undefined} returns undefined
 */
ReactionRouter.initPackageRoutes = () => {
  const pkgs = Packages.find().fetch();
  const prefix = Reaction.getShopName().toLowerCase(); // todo add shopId

  // initialize index
  // define default routing groups
  let shop = ReactionRouter.group({
    name: "shop"
  });

  //
  // index / home route
  //
  shop.route("/", {
    name: "index",
    action: function () {
      ReactionLayout();
    }
  });

  // get package registry route configurations
  for (let pkg of pkgs) {
    const newRoutes = [];
    // pkg registry
    if (pkg.registry) {
      const registry = Array.from(pkg.registry);
      for (let registryItem of registry) {
        // registryItems
        if (registryItem.route) {
          let {
            route,
            template,
            layout,
            workflow,
            triggersEnter,
            triggersExit
          } = registryItem;

          // get registry route name
          const routeName = getRegistryRouteName(pkg.name, registryItem);

          // layout option structure
          const options = {
            template: template,
            workflow: workflow,
            layout: layout
          };

          // define new route
          // we could allow the options to be passed in the registry if we need to be more flexible
          let newRouteConfig = {
            route: route,
            options: {
              name: routeName,
              template: options.template,
              layout: options.layout,
              triggersEnter: triggersEnter,
              triggersExit: triggersExit,
              action: () => {
                ReactionLayout(options);
              }
            }
          };
          // push new routes
          newRoutes.push(newRouteConfig);
        } // end registryItems
      } // end package.registry

      //
      // add group and routes to routing table
      //
      let uniqRoutes = new Set(newRoutes);
      for (const route of uniqRoutes) {
        shop.newGroup = ReactionRouter.group({
          prefix: "/" + prefix
        });
        // todo: look for a cheap way to validate and prevent duplicate additions
        shop.newGroup.route(route.route, route.options);
      }
    }
  } // end package loop

  //
  // initialize the router
  //
  try {
    ReactionRouter.initialize();
  } catch (e) {
    ReactionRouter.reload();
  }
};

export default ReactionRouter;
