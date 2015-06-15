/**
 * straps.js - Class inheritance library with support for bean-style accessors
 *
 * Copyright (c) 2006 - 2014 Juerg Lehni
 * http://lehni.org/
 *
 * Distributed under the MIT license.
 *
 * straps.js was created by extracting and simplifying the inheritance framework
 * from boostrap.js, a JavaScript DOM library, also created by Juerg Lehni:
 * https://github.com/lehni/bootstrap.js
 *
 * Inspirations:
 * http://dean.edwards.name/weblog/2006/03/base/
 * http://dev.helma.org/Wiki/JavaScript+Inheritance+Sugar/
 */

var Base = new function() {
    var hidden = /^(statics|enumerable|beans|preserve)$/,

        forEach = [].forEach || function(iter, bind) {
            for (var i = 0, l = this.length; i < l; i++)
                iter.call(bind, this[i], i, this);
        },

        forIn = function(iter, bind) {
            // Do not use Object.keys for iteration as iterators might modify
            // the object we're iterating over, making the hasOwnProperty still
            // necessary.
            for (var i in this)
                if (this.hasOwnProperty(i))
                    iter.call(bind, this[i], i, this);
        },

        // A short-cut to a simplified version of Object.create that only
        // supports the first parameter (in the emulation):
        create = Object.create || function(proto) {
            // From all browsers that do not offer Object.create(), we only
            // support Firefox 3.5 & 3.6, and this hack works there:
            return { __proto__: proto };
        },

        describe = Object.getOwnPropertyDescriptor || function(obj, name) {
            // Emulate Object.getOwnPropertyDescriptor for outdated browsers
            var get = obj.__lookupGetter__ && obj.__lookupGetter__(name);
            return get
                    ? { get: get, set: obj.__lookupSetter__(name),
                        enumerable: true, configurable: true }
                    : obj.hasOwnProperty(name)
                        ? { value: obj[name], enumerable: true,
                            configurable: true, writable: true }
                        : null;
        },

        _define = Object.defineProperty || function(obj, name, desc) {
            // Emulate Object.defineProperty for outdated browsers
            if ((desc.get || desc.set) && obj.__defineGetter__) {
                if (desc.get)
                    obj.__defineGetter__(name, desc.get);
                if (desc.set)
                    obj.__defineSetter__(name, desc.set);
            } else {
                obj[name] = desc.value;
            }
            return obj;
        },

        define = function(obj, name, desc) {
            // Both Safari and Chrome at one point ignored configurable = true
            // and did not allow overriding of existing properties:
            // https://code.google.com/p/chromium/issues/detail?id=72736
            // https://bugs.webkit.org/show_bug.cgi?id=54289
            // The workaround is to delete the property first.
            // TODO: Remove this fix in July 2014, and use _define directly.
            delete obj[name];
            return _define(obj, name, desc);
        };

    /**
     * Private function that injects functions from src into dest, overriding
     * the previous definition, preserving a link to it through Function#base.
     */
    function inject(dest, src, enumerable, beans, preserve) {
        var beansNames = {};

        /**
         * Private function that injects one field with given name and checks if
         * the field is a function with a previous definition that we need to
         * link to through Function#base.
         */
        function field(name, val) {
            // This does even work for prop: 0, as it will just be looked up
            // again through describe.
            val = val || (val = describe(src, name))
                    && (val.get ? val : val.value);
            // Allow aliases to properties with different names, by having
            // string values starting with '#'
            if (typeof val === 'string' && val[0] === '#')
                val = dest[val.substring(1)] || val;
            var isFunc = typeof val === 'function',
                res = val,
                // Only lookup previous value if we preserve existing entries or
                // define a function that might need it for Function#base. If
                // a getter is defined, don't lookup previous value, but look if
                // the property exists (name in dest) and store result in prev
                prev = preserve || isFunc
                        ? (val && val.get ? name in dest : dest[name])
                        : null,
                bean;
            if (!preserve || !prev) {
                // Expose the 'super' function (meaning the one this function is
                // overriding) through Function#base:
                if (isFunc && prev)
                    val.base = prev;
                // Produce bean properties if getters or setters are specified.
                // Just collect potential beans for now, and look them up in
                // dest at the end of fields injection. This ensures base works
                // for beans too, and inherits setters for redefined getters in
                // subclasses.
                if (isFunc && beans !== false
                        && (bean = name.match(/^([gs]et|is)(([A-Z])(.*))$/)))
                    beansNames[bean[3].toLowerCase() + bean[4]] = bean[2];
                // No need to create accessor description if it already is one.
                // It is considered a description if it is a plain object with a
                // get function.
                if (!res || isFunc || !res.get || typeof res.get !== 'function'
                        || !Base.isPlainObject(res))
                    res = { value: res, writable: true };
                // Only set/change configurable and enumerable if this field is
                // configurable
                if ((describe(dest, name)
                        || { configurable: true }).configurable) {
                    res.configurable = true;
                    res.enumerable = enumerable;
                }
                define(dest, name, res);
            }
        }
        // Iterate through all definitions in src now and call field() for each.
        if (src) {
            for (var name in src) {
                if (src.hasOwnProperty(name) && !hidden.test(name))
                    field(name);
            }
            // Now process the beans as well.
            for (var name in beansNames) {
                // Simple Beans Convention:
                // - If `beans: false` is specified, no beans are injected.
                // - `isName()` is only considered a getter of a  bean accessor
                //   if there is also a setter for it.
                // - If a potential getter has no parameters, it forms a bean
                //   accessor.
                // - If `beans: true` is specified, the parameter count of a
                //   potential getter is ignored and the bean is always created.
                var part = beansNames[name],
                    set = dest['set' + part],
                    get = dest['get' + part] || set && dest['is' + part];
                if (get && (beans === true || get.length === 0))
                    field(name, { get: get, set: set });
            }
        }
        return dest;
    }

    function each(obj, iter, bind) {
        // To support both array-like structures and plain objects, use a simple
        // hack to filter out Base objects with #length getters in the
        // #length-base array-like check for now, by assuming these getters are
        // produced by #getLength beans.
        // NOTE: The correct check would call describe(obj, 'length') and look
        // for typeof res.value === 'number', but it's twice as slow on Chrome
        // and Firefox (WebKit does well), so this should do for now.
        if (obj)
            ('length' in obj && !obj.getLength
                    && typeof obj.length === 'number'
                ? forEach
                : forIn).call(obj, iter, bind = bind || obj);
        return bind;
    }

    function set(obj, props, exclude) {
        for (var key in props)
            if (props.hasOwnProperty(key) && !(exclude && exclude[key]))
                obj[key] = props[key];
        return obj;
    }

    // Inject into new ctor object that's passed to inject(), and then returned
    // as the Base class.
    return inject(function Base() {
        // Define a constructor that merges in all the fields of the passed
        // objects using set()
        for (var i = 0, l = arguments.length; i < l; i++)
            set(this, arguments[i]);
    }, {
        inject: function(src/*, ... */) {
            if (src) {
                // Allow the whole scope to just define statics by defining
                // `statics: true`
                var statics = src.statics === true ? src : src.statics,
                    beans = src.beans,
                    preserve = src.preserve;
                if (statics !== src)
                    inject(this.prototype, src, src.enumerable, beans, preserve);
                // Define new static fields as enumerable, and inherit from
                // base. enumerable is necessary so they can be copied over from
                // base, and it does not harm to have enumerable properties in
                // the constructor. Use the preserve setting in src.preserve for
                // statics too, not their own.
                inject(this, statics, true, beans, preserve);
            }
            // If there are more than one argument, loop through them and call
            // inject again. Do not simple inline the above code in one loop,
            // since each of the passed objects might override this.inject.
            for (var i = 1, l = arguments.length; i < l; i++)
                this.inject(arguments[i]);
            return this;
        },

        extend: function(/* src, ... */) {
            var base = this,
                ctor,
                proto;
            // Look for an initialize function in all injection objects and use
            // it directly as the actual constructor.
            for (var i = 0, l = arguments.length; i < l; i++)
                if (ctor = arguments[i].initialize)
                    break;
            // If no initialize function is provided, create a constructor that
            // simply calls the base constructor.
            ctor = ctor || function() {
                base.apply(this, arguments);
            };
            proto = ctor.prototype = create(this.prototype);
            // The new prototype extends the constructor on which extend is
            // called. Fix constructor.
            define(proto, 'constructor',
                    { value: ctor, writable: true, configurable: true });
            // Copy over static fields, as prototype-like inheritance
            // is not possible for static fields. Mark them as enumerable
            // so they can be copied over again.
            inject(ctor, this, true);
            // Inject all the definitions in src. Use the new inject instead of
            // the one in ctor, in case it was overridden. this is needed when
            // overriding the static .inject(). But only inject if there's
            // something to actually inject.
            if (arguments.length)
                this.inject.apply(ctor, arguments)
            // Expose base property on constructor functions as well.
            // Do this after everything else, to avoid incorrect overriding of
            // `base` in inject() when creating long super call chains in
            // constructors. 
            ctor.base = base;
            return ctor;
        }
        // Pass true for enumerable, so inject() and extend() can be passed on
        // to subclasses of Base through Base.inject() / extend().
    }, true).inject({
        /**
         * Injects the fields from the given object.
         */
        inject: function(/* src, ... */) {
            for (var i = 0, l = arguments.length; i < l; i++) {
                var src = arguments[i];
                if (src)
                    inject(this, src, src.enumerable, src.beans, src.preserve);
            }
            return this;
        },

        /**
         * Returns a new object that inherits all properties from "this",
         * through proper JS inheritance, not copying.
         * Optionally, src and hide parameters can be passed to fill in the
         * newly created object just like in inject(), to copy the behavior
         * of Function.prototype.extend.
         */
        extend: function(/* src, ... */) {
            var res = create(this);
            return res.inject.apply(res, arguments);
        },

        each: function(iter, bind) {
            return each(this, iter, bind);
        },

        set: function(props) {
            return set(this, props);
        },

        /**
         * General purpose clone function that delegates cloning to the
         * constructor that receives the object to be cloned as the first
         * argument.
         * NOTE: #clone() needs to be overridden in any class that requires
         * other cloning behavior.
         */
        clone: function() {
            return new this.constructor(this);
        },

        statics: {
            // Expose some local privates as static functions on Base.
            each: each,
            create: create,
            define: define,
            describe: describe,
            set: set,

            clone: function(obj) {
                return set(new obj.constructor(), obj);
            },

            /**
             * Returns true if obj is a plain JavaScript object literal, or a
             * plain Base object, as produced by Base.merge().
             */
            isPlainObject: function(obj) {
                var ctor = obj != null && obj.constructor;
                // We also need to check for ctor.name === 'Object', in case
                // this is an object from another global scope (e.g. an iframe,
                // or another vm context in node.js).
                return ctor && (ctor === Object || ctor === Base
                        || ctor.name === 'Object');
            },

            /**
             * Returns the 1st argument if it is defined, the 2nd otherwise.
             * `null` is counted as defined too, as !== undefined is used for
             * comparisons.
             */
            pick: function(a, b) {
                return a !== undefined ? a : b;
            }
        }
    });
};

// Export Base class for node
if (typeof module !== 'undefined')
    module.exports = Base;
