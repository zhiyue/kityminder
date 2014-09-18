var ViewDragger = kity.createClass("ViewDragger", {
    constructor: function(minder) {
        this._minder = minder;
        this._enabled = false;
        this._bind();
        var me = this;
        this._minder.getViewDragger = function() {
            return me;
        };
    },

    isEnabled: function() {
        return this._enabled;
    },

    setEnabled: function(value) {
        var paper = this._minder.getPaper();
        paper.setStyle('cursor', value ? 'pointer' : 'default');
        paper.setStyle('cursor', value ? '-webkit-grab' : 'default');
        this._enabled = value;
    },

    move: function(offset, duration) {
        var minder = this._minder;

        var targetPosition = this.getMovement().offset(offset);

        this.moveTo(targetPosition, duration);
    },

    moveTo: function(position, duration) {

        if (duration) {
            var dragger = this;

            this._minder.getRenderContainer().animate(new kity.Animator(
                this.getMovement(),
                position,
                function(target, value) {
                    dragger.moveTo(value);
                }
            ), duration, 'easeOutCubic');

            return this;
        }

        this._minder.getRenderContainer().setTranslate(position.round());
        this._minder.fire('viewchange');
    },

    getMovement: function() {
        var translate = this._minder.getRenderContainer().transform.translate;
        return translate ? translate[0] : new kity.Point();
    },

    getView: function() {
        var minder = this._minder;
        var c = {
            width: minder.getRenderTarget().clientWidth,
            height: minder.getRenderTarget().clientHeight
        };
        var m = this.getMovement();
        var box = new kity.Box(-m.x, -m.y, c.width, c.height);
        return box;
    },

    _bind: function() {
        var dragger = this,
            isTempDrag = false,
            lastPosition = null,
            currentPosition = null;

        function dragEnd(e) {
            lastPosition = null;

            e.stopPropagation();

            // 临时拖动需要还原状态
            if (isTempDrag) {
                dragger.setEnabled(false);
                isTempDrag = false;
                if (dragger._minder.getStatus() == 'hand')
                    dragger._minder.rollbackStatus();
            }
        }

        this._minder.on('normal.mousedown normal.touchstart ' +
            'inputready.mousedown inputready.touchstart ' +
            'readonly.mousedown readonly.touchstart', function(e) {
                if (e.originEvent.button == 2) {
                    e.originEvent.preventDefault(); // 阻止中键拉动
                }
                // 点击未选中的根节点临时开启
                if (e.getTargetNode() == this.getRoot() || e.originEvent.button == 2) {
                    lastPosition = e.getPosition();
                    isTempDrag = true;
                }
            })

        .on('normal.mousemove normal.touchmove ' +
            'readonly.touchmove readonly.mousemove ' +
            'inputready.mousemove inputready.touchmove', function(e) {
                if (e.type == 'touchmove') {
                    e.preventDefault(); // 阻止浏览器的后退事件
                }
                if (!isTempDrag) return;
                var offset = kity.Vector.fromPoints(lastPosition, e.getPosition());
                if (offset.length() > 3) this.setStatus('hand');
            })

        .on('hand.beforemousedown hand.beforetouchstart', function(e) {
            // 已经被用户打开拖放模式
            if (dragger.isEnabled()) {
                lastPosition = e.getPosition();
                e.stopPropagation();
            }
        })

        .on('hand.beforemousemove hand.beforetouchmove', function(e) {
            if (lastPosition) {
                currentPosition = e.getPosition();

                // 当前偏移加上历史偏移
                var offset = kity.Vector.fromPoints(lastPosition, currentPosition);
                dragger.move(offset);
                e.stopPropagation();
                e.preventDefault();
                e.originEvent.preventDefault();
                lastPosition = currentPosition;
            }
        })

        .on('mouseup touchend', dragEnd);

        window.addEventListener('mouseup', dragEnd);
    }
});

KityMinder.registerModule('View', function() {

    var km = this;

    var ToggleHandCommand = kity.createClass('ToggleHandCommand', {
        base: Command,
        execute: function(minder) {

            if (minder.getStatus() != 'hand') {
                minder.setStatus('hand');
            } else {
                minder.rollbackStatus();
            }
            this.setContentChanged(false);

        },
        queryState: function(minder) {
            return minder.getStatus() == 'hand' ? 1 : 0;
        },
        enableReadOnly: false
    });

    var CameraCommand = kity.createClass('CameraCommand', {
        base: Command,
        execute: function(km, focusNode, duration) {

            focusNode = focusNode || km.getRoot();
            var viewport = km.getPaper().getViewPort();
            var offset = focusNode.getRenderContainer().getRenderBox('view');
            var dx = viewport.center.x - offset.x - offset.width / 2,
                dy = viewport.center.y - offset.y;
            var dragger = km._viewDragger;

            dragger.move(new kity.Point(dx, dy), duration);
            this.setContentChanged(false);
        },
        enableReadOnly: false
    });

    var MoveCommand = kity.createClass('MoveCommand', {
        base: Command,

        execute: function(km, dir, duration) {
            var dragger = km._viewDragger;
            var size = km._lastClientSize;
            switch (dir) {
                case 'up':
                    dragger.move(new kity.Point(0, -size.height / 2), duration);
                    break;
                case 'down':
                    dragger.move(new kity.Point(0, size.height / 2), duration);
                    break;
                case 'left':
                    dragger.move(new kity.Point(-size.width / 2, 0), duration);
                    break;
                case 'right':
                    dragger.move(new kity.Point(size.width / 2, 0), duration);
                    break;
            }
        }
    });

    return {
        init: function() {
            this._viewDragger = new ViewDragger(this);
        },
        commands: {
            'hand': ToggleHandCommand,
            'camera': CameraCommand,
            'move': MoveCommand
        },
        events: {
            keyup: function(e) {
                if (e.originEvent.keyCode == keymap.Spacebar && this.getSelectedNodes().length === 0) {
                    this.execCommand('hand');
                    e.preventDefault();
                }
            },
            keydown: function(e) {
                var minder = this;
                ['up', 'down', 'left', 'right'].forEach(function(name) {
                    if (e.isShortcutKey('ctrl+' + name)) {
                        minder.execCommand('move', name, 600);
                        e.preventDefault();
                    }
                });
            },
            statuschange: function(e) {
                this._viewDragger.setEnabled(e.currentStatus == 'hand');
            },
            mousewheel: function(e) {
                var dx, dy;
                e = e.originEvent;
                if (e.ctrlKey || e.shiftKey) return;
                if ('wheelDeltaX' in e) {

                    dx = e.wheelDeltaX || 0;
                    dy = e.wheelDeltaY || 0;

                } else {

                    dx = 0;
                    dy = e.wheelDelta;

                }

                this._viewDragger.move({
                    x: dx / 2.5,
                    y: dy / 2.5
                });

                e.preventDefault();
            },
            'normal.dblclick readonly.dblclick': function(e) {
                if (e.kityEvent.targetShape instanceof kity.Paper) {
                    this.execCommand('camera', this.getRoot(), 800);
                }
            },
            ready: function() {
                this.execCommand('camera', null, 0);
                this._lastClientSize = {
                    width: this.getRenderTarget().clientWidth,
                    height: this.getRenderTarget().clientHeight
                };
            },
            resize: function(e) {
                var a = {
                        width: this.getRenderTarget().clientWidth,
                        height: this.getRenderTarget().clientHeight
                    },
                    b = this._lastClientSize;
                this._viewDragger.move(
                    new kity.Point((a.width - b.width) / 2 | 0, (a.height - b.height) / 2 | 0));
                this._lastClientSize = a;
            }
        }
    };
});