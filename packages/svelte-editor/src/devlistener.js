//import { add, update, remove } from './listener.js'
//import { updateProfile } from './profiler.js'

//import {StackTrace} from 'stacktrace-js';
import StackTrace from 'stacktrace-js';

export function newDevListener() {
    const nodeMap = new Map()
    let _id = 0
    let currentBlock
  
    function getNode(id) {
      return nodeMap.get(id)
    }
  
    function getAllNodes() {
      nodeMap.values()
    }
  
    const rootNodes = []
    function getRootNodes() {
      return rootNodes
    }
  
    let svelteVersion = null
    function getSvelteVersion() {
      return svelteVersion
    }
  
    function addNode(node, target, anchor) {
      nodeMap.set(node.id, node)
      nodeMap.set(node.detail, node)
  
      let targetNode = nodeMap.get(target)
      if (!targetNode || targetNode.parentBlock != node.parentBlock) {
        targetNode = node.parentBlock
      }
  
      node.parent = targetNode
  
      const anchorNode = nodeMap.get(anchor)
  
      if (targetNode) {
        let index = -1
        if (anchorNode) index = targetNode.children.indexOf(anchorNode)
  
        if (index != -1) {
          targetNode.children.splice(index, 0, node)
        } else {
          targetNode.children.push(node)
        }
      } else {
        rootNodes.push(node)
      }
  
      //TODO add(node, anchorNode)
    }
  
    function removeNode(node) {
      if (!node) return
  
      nodeMap.delete(node.id)
      nodeMap.delete(node.detail)
  
      const index = node.parent?.children.indexOf(node)
      node.parent?.children.splice(index, 1)
      node.parent = null
  
      //TODO remove(node)
    }
  
    function updateElement(element) {
      const node = nodeMap.get(element)
      if (!node) return
  
      if (node.type == 'anchor') node.type = 'text'
  
      //TODO update(node)
    }
  
    function insert(element, target, anchor) {
      const node = {
        id: _id++,
        type:
          element.nodeType == 1
            ? 'element'
            : element.nodeValue && element.nodeValue != ' '
            ? 'text'
            : 'anchor',
        detail: element,
        tagName: element.nodeName.toLowerCase(),
        parentBlock: currentBlock,
        children: []
      }
      addNode(node, target, anchor)
  
      for (const child of element.childNodes) {
        if (!nodeMap.has(child)) insert(child, element)
      }
    }
  
    function stack(dbg) {
      console.log('stack', dbg, Error().stack)
      StackTrace.get().then((x)=>console.log('fuck', x))
    }

    function svelteRegisterComponent(e) {
      const { component, tagName } = e.detail
  
      stack('svelteRegisterComponent')

      const node = nodeMap.get(component.$$.fragment)
      if (node) {
        nodeMap.delete(component.$$.fragment)
  
        node.detail = component
        node.tagName = tagName
  
        //TODO update(node)
      } else {
        nodeMap.set(component.$$.fragment, {
          type: 'component',
          detail: component,
          tagName
        })
      }
    }
  
    // Ugly hack b/c promises are resolved/rejected outside of normal render flow
    let lastPromiseParent = null
    function svelteRegisterBlock(e) {
      const { type, id, block, ...detail } = e.detail

      stack('svelteRegisterBlock')

      const tagName = type == 'pending' ? 'await' : type
      const nodeId = _id++
  
      if (block.m) {
        const mountFn = block.m
        block.m = (target, anchor) => {
          stack('mount')

          const parentBlock = currentBlock
          let node = {
            id: nodeId,
            type: 'block',
            detail,
            tagName,
            parentBlock,
            children: []
          }
  
          switch (type) {
            case 'then':
            case 'catch':
              if (!node.parentBlock) node.parentBlock = lastPromiseParent
              break
  
            case 'slot':
              node.type = 'slot'
              break
  
            case 'component':
              const componentNode = nodeMap.get(block)
              if (componentNode) {
                nodeMap.delete(block)
                Object.assign(node, componentNode)
              } else {
                Object.assign(node, {
                  type: 'component',
                  tagName: 'Unknown',
                  detail: {}
                })
                nodeMap.set(block, node)
              }
  
              Promise.resolve().then(
                () =>
                  node.detail.$$ &&
                  Object.keys(node.detail.$$.bound).length// &&
                  //TODO update(node)
              )
              break
          }
  
          if (type == 'each') {
            let group = nodeMap.get(parentBlock.id + id)
            if (!group) {
              group = {
                id: _id++,
                type: 'block',
                detail: {
                  ctx: {},
                  source: detail.source
                },
                tagName: 'each',
                parentBlock,
                children: []
              }
              nodeMap.set(parentBlock.id + id, group)
              addNode(group, target, anchor)
            }
            node.parentBlock = group
            node.type = 'iteration'
            addNode(node, group, anchor)
          } else {
            addNode(node, target, anchor)
          }
  
          currentBlock = node
          //TODO updateProfile(node, 'mount', mountFn, target, anchor)
          mountFn(target, anchor)
          currentBlock = parentBlock
        }
      }
  
      if (block.p) {
        const patchFn = block.p
        block.p = (changed, ctx) => {
          const parentBlock = currentBlock
          currentBlock = nodeMap.get(nodeId)
  
          //TODO update(currentBlock)
  
          //TODO updateProfile(currentBlock, 'patch', patchFn, changed, ctx)
          patchFn(changed, ctx)
  
          currentBlock = parentBlock
        }
      }
  
      if (block.d) {
        const detachFn = block.d
        block.d = detaching => {
          const node = nodeMap.get(nodeId)
  
          if (node) {
            if (node.tagName == 'await') lastPromiseParent = node.parentBlock
  
            removeNode(node)
          }
  
          //TODO updateProfile(node, 'detach', detachFn, detaching)
          detachFn(detaching)
        }
      }
    }
  
    function svelteDOMInsert(e) {
      const { node: element, target, anchor } = e.detail
  
      insert(element, target, anchor)
      console.log('XXX', e, rootNodes)
    }
  
    function svelteDOMRemove(e) {
      const node = nodeMap.get(e.detail.node)
      if (!node) return
  
      removeNode(node)
    }
  
    function svelteDOMAddEventListener(e) {
      const { node, ...detail } = e.detail
  
      if (!node.__listeners) node.__listeners = []
  
      node.__listeners.push(detail)
    }
  
    function svelteDOMRemoveEventListener(e) {
      const { node, event, handler, modifiers } = e.detail
  
      if (!node.__listeners) return
  
      const index = node.__listeners.findIndex(
        o => o.event == event && o.handler == handler && o.modifiers == modifiers
      )
  
      if (index == -1) return
  
      node.__listeners.splice(index, 1)
    }
  
    function svelteUpdateNode(e) {
      updateElement(e.detail.node)
    }
  
    function addEventListeners(root) {
      root.addEventListener('SvelteRegisterBlock', e => svelteVersion = e.detail.version, { once: true })
  
      root.addEventListener('SvelteRegisterComponent', svelteRegisterComponent)
      root.addEventListener('SvelteRegisterBlock', svelteRegisterBlock)
      root.addEventListener('SvelteDOMInsert', svelteDOMInsert)
      root.addEventListener('SvelteDOMRemove', svelteDOMRemove)
      root.addEventListener('SvelteDOMAddEventListener', svelteDOMAddEventListener)
      root.addEventListener('SvelteDOMRemoveEventListener', svelteDOMRemoveEventListener)
      root.addEventListener('SvelteDOMSetData', svelteUpdateNode)
      root.addEventListener('SvelteDOMSetProperty', svelteUpdateNode)
      root.addEventListener('SvelteDOMSetAttribute', svelteUpdateNode)
      root.addEventListener('SvelteDOMRemoveAttribute', svelteUpdateNode)
    }
  
    return {
      getNode,
      getRootNodes,
      getSvelteVersion,
      addEventListeners
    }
  }
  
  export function addEventListeners(doc, listener) {
    listener.setup(doc)
    for (let i = 0; i < window.frames.length; i++) {
      const frame = window.frames[i]
      const root = frame.document
      listener.setup(root)
      const timer = setInterval(() => {
        if (root == frame.document) return
        clearTimeout(timer)
        listener.setup(frame.document)
      }, 0)
      root.addEventListener('readystatechange', e => clearTimeout(timer), { once: true })
    }
  }
  