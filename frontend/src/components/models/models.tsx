import React from 'react';

import axios from 'axios';

import {Counter, MultiplicityList} from "./utils";
import store from '../state/store';
import wu from 'wu';
import {Link} from "react-router-dom";


export const apiPath = '/api/';


export class Atomic {
  id: string;

  constructor(id: string) {
    this.id = id
  }

  public static fromRemote(remote: any): Atomic {
    return new Atomic('0')
  }

}


interface Remoteable<T> {
  fromRemote: (remote: any) => T
}


export class Imageable extends Atomic {

  getType = (): string => {
    return 'Imageable';
  };

}


export class Cubeable extends Imageable {

  getType = (): string => {
    return 'Cubeable';
  };

  getSortValue = (): string => {
    return '';
  };

}


export class Expansion extends Atomic {
  code: string;
  name: string;

  constructor(id: string, code: string, name: string) {
    super(id);
    this.code = code;
    this.name = name;
  }

  public static fromRemote(remote: any): Expansion {
    return new Expansion(remote.id, remote.code, remote.name)
  }

}


export class Cardboard extends Imageable {
  name: string;
  color: string[];
  types: string[];

  constructor(id: string, color: string[], types: string[]) {
    super(id);
    this.name = id;
    this.color = color;
    this.types = types;
  }

  public static fromRemote(remote: any): Cardboard {
    return new Cardboard(
      remote.id,
      remote.color,
      remote.types,
    )
  }

  getType = (): string => {
    return 'Cardboard'
  };

  getSortValue = (): string => {
    return this.name;
  };

}


export class Printing extends Cubeable {
  name: string;
  expansion: Expansion;
  color: string[];
  types: string[];

  constructor(id: string, name: string, expansion: Expansion, color: string[], types: string[]) {
    super(id);
    this.name = name;
    this.expansion = expansion;
    this.color = color;
    this.types = types;
  }

  public static fromRemote(remote: any): Printing {
    return new Printing(
      remote.id,
      remote.name,
      Expansion.fromRemote(remote.expansion),
      remote.color,
      remote.types,
    )
  }

  getType = (): string => {
    return 'Printing'
  };

  getSortValue = (): string => {
    return this.name;
  };

  full_name = (): string => {
    return this.name + '|' + this.expansion.code;
  };

  public static random(): Promise<Printing> {
    return axios.get(
      apiPath + 'service/random-printing/'
    ).then(
      response => Printing.fromRemote(response.data)
    )
  }

}


export class PrintingNode extends Atomic {
  children: MultiplicityList<Printing | PrintingNode>;
  type: string;

  constructor(id: string, children: MultiplicityList<Printing | PrintingNode>, type: string) {
    super(id);
    this.children = children;
    this.type = type;
  }

  public static fromRemote(remote: any): PrintingNode {
    return new PrintingNode(
      remote.id,
      new MultiplicityList(
        remote.children.map(
          ([child, multiplicity]: [any, number]) => [
            child.type === 'printing' ? Printing.fromRemote(child) : PrintingNode.fromRemote(child),
            multiplicity,
          ]
        )
      ),
      remote.type
    )
  };

  * printings(): IterableIterator<Printing> {
    for (const [child, multiplicity] of this.children.items) {
      for (let i = 0; i < multiplicity; i++) {
        if (child instanceof Printing) {
          yield child
        } else {
          yield* (child as PrintingNode).printings()
        }
      }
    }
  };

  representation = (): string => {
    return '(' + this.children.items.map(
      ([child, multiplicity]: [Printing | PrintingNode, number]) =>
        (multiplicity == 1 ? "" : multiplicity.toString() + "# ")
        + (child instanceof Printing ? child.full_name() : child.representation())
    ).join(
      this.type === 'AllNode' ? '; ' : ' || '
    ) + ')'
  };

  serialize = (): any => {
    return {
      type: this.type,
      options: this.children.items.map(
        ([child, multiplicity]) => [
          child instanceof Printing ? child.id : child.serialize(),
          multiplicity,
        ]
      )
    }
  };

}


export class Trap extends Cubeable {
  node: PrintingNode;
  intentionType: string;

  constructor(id: string, node: PrintingNode, intentionType: string) {
    super(id);
    this.node = node;
    this.intentionType = intentionType;
  }

  public static fromRemote(remote: any): Trap {
    return new Trap(
      remote.id,
      PrintingNode.fromRemote(remote.node),
      remote.intention_type,
    )
  }

  getType = (): string => {
    return 'Trap';
  };

  getSortValue = (): string => {
    return this.node.representation();
  };

  serialize = (): any => {
    return {
      node: this.node.serialize(),
      intention_type: this.intentionType,
    }
  };

  public static parse(query: string, intentionType: string): any {
    return axios.post(
      apiPath + 'service/parse-trap/',
      {
        query: query,
        intention_type: intentionType,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Token ${store.getState().token}`,
        }
      },
    ).then(
      response => Trap.fromRemote(response.data)
    )
  }

}


export class TrapCollection {
  traps: Counter<Trap>;

  constructor(traps: Counter<Trap>) {
    this.traps = traps;
  }

  public static fromRemote(remote: any): TrapCollection {
    return new TrapCollection(
      new Counter(
        remote.traps.map(
          ([trap, multiplicity]: [any, number]) => [Trap.fromRemote(trap), multiplicity]
        )
      )
    )
  }

}


export class DistributionPossibility extends Atomic {
  createdAt: string;
  pdfUrl: null | string;
  addedPdfUrl: null | string;
  removedPdfUrl: null | string;
  trapCollection: TrapCollection;
  fitness: number;
  addedTraps: TrapCollection;
  removedTraps: TrapCollection;

  constructor(
    id: string,
    createdAt: string,
    pdfUrl: null | string,
    addedPdfUrl: null | string,
    removedPdfUrl: null | string,
    trapCollection: TrapCollection,
    fitness: number,
    addedTraps: TrapCollection,
    removedTraps: TrapCollection,
  ) {
    super(id);
    this.createdAt = createdAt;
    this.pdfUrl = pdfUrl;
    this.addedPdfUrl = addedPdfUrl;
    this.removedPdfUrl = removedPdfUrl;
    this.trapCollection = trapCollection;
    this.fitness = fitness;
    this.addedTraps = addedTraps;
    this.removedTraps = removedTraps;
  }

  public static fromRemote(remote: any): DistributionPossibility {
    return new DistributionPossibility(
      remote.id,
      remote.created_at,
      remote.pdf_url,
      remote.added_pdf_url,
      remote.removed_pdf_url,
      TrapCollection.fromRemote(
        remote.trap_collection
      ),
      remote.fitness,
      TrapCollection.fromRemote(
        remote.added_traps
      ),
      TrapCollection.fromRemote(
        remote.removed_traps
      ),
    )
  }

}


export class Ticket extends Cubeable {
  name: string;

  constructor(id: string, name: string) {
    super(id);
    this.name = name;
  }

  public static fromRemote(remote: any): Ticket {
    return new Ticket(remote.id, remote.name)
  }

  getType = (): string => {
    return 'Ticket';
  };

  getSortValue = (): string => {
    return 'Ticket';
  };

}


export class Purple extends Cubeable {
  name: string;

  constructor(id: string, name: string) {
    super(id);
    this.name = name;
  }

  public static fromRemote(remote: any): Purple {
    return new Purple(remote.id, remote.name)
  }

  getType = (): string => {
    return 'Purple';
  };

  getSortValue = (): string => {
    return 'Purple';
  };

  serialize = (): any => {
    return {
      name: this.name,
      description: '',
    }
  }

}


export class User extends Atomic {
  username: string;

  constructor(id: string, username: string) {
    super(id);
    this.username = username;
  }

  public static fromRemote(remote: any): User {
    return new User(remote.id, remote.username)
  }

  static all = (): Promise<User[]> => {
    // TODO pagination lol
    return axios.get(
      apiPath + 'users/'
    ).then(
      response => response.data.results.map(
        (user: any) => User.fromRemote(user)
      )
    )
  };

  static get = (id: string): Promise<User> => {
    return axios.get(
      apiPath + 'users/' + id + '/'
    ).then(
      response => User.fromRemote(response.data)
    )
  };

}


export class MinimalCube extends Atomic {
  name: string;
  description: string;
  author: User;
  createdAt: string;

  constructor(id: string, name: string, description: string, author: User, createdAt: string) {
    super(id);
    this.name = name;
    this.description = description;
    this.author = author;
    this.createdAt = createdAt;
  }

  public static fromRemote(remote: any): MinimalCube {
    return new MinimalCube(
      remote.id,
      remote.name,
      remote.description,
      User.fromRemote(remote.author),
      remote.created_at,
    )
  }

}


interface PaginationResponse<T> {
  objects: T[]
  hits: number
}


export class Cube extends MinimalCube {
  releases: CubeReleaseMeta[];

  constructor(
    id: string,
    name: string,
    description: string,
    author: User,
    createdAt: string,
    releases: CubeReleaseMeta[],
  ) {
    super(id, name, description, author, createdAt);
    this.releases = releases;
  }

  public static fromRemote(remote: any) {
    return new Cube(
      remote.id,
      remote.name,
      remote.description,
      User.fromRemote(remote.author),
      remote.created_at,
      remote.releases.map(
        (release: any) => CubeReleaseMeta.fromRemote(release)
      )
    )
  }

  latestRelease = (): (CubeReleaseMeta | null) => {
    if (this.releases.length < 1) {
      return null;
    }
    return this.releases[0];
  };

  static all = (offset: number = 0, limit: number = 50): Promise<PaginationResponse<Cube>> => {
    return axios.get(
      apiPath + 'versioned-cubes/',
      {
        params: {
          offset,
          limit,
        }
      },
    ).then(
      response => {
        return {
          objects: response.data.results.map(
            (cube: any) => Cube.fromRemote(cube)
          ),
          hits: response.data.count,
        }
      }
    )
  };

  static get = (id: string): Promise<Cube> => {
    return axios.get(
      apiPath + 'versioned-cubes/' + id + '/'
    ).then(
      response => Cube.fromRemote(response.data)
    )
  };

}


export class CubeReleaseName extends Atomic {
  name: string;

  constructor(id: string, name: string) {
    super(id);
    this.name = name
  }

  public static fromRemote(remote: any): CubeReleaseName {
    return new CubeReleaseName(
      remote.id,
      remote.name,
    )
  }
}


export class CubeReleaseMeta extends CubeReleaseName {
  createdAt: string;
  createAtTimestamp: number;
  intendedSize: string;

  constructor(id: string, name: string, createdAt: string, intendedSize: string) {
    super(id, name);
    this.createdAt = createdAt;
    this.createAtTimestamp = Date.parse(createdAt);
    this.intendedSize = intendedSize;
  };

  public static fromRemote(remote: any): CubeReleaseMeta {
    return new CubeReleaseMeta(
      remote.id,
      remote.name,
      remote.created_at,
      remote.intended_size,
    )
  };

}


export class PrintingCounter extends Counter<Printing> {

  public static collectFromIterable<T>(printings: IterableIterator<Printing>): PrintingCounter {
    const counter: PrintingCounter = new PrintingCounter();
    for (const printing of printings) {
      counter.add(printing);
    }
    return counter;
  }

  printings_of_color = (color: string): wu.WuIterable<[Printing, number]> => {
    return wu(this.items()).filter(
      ([printing, _]: [Printing, number]) =>
        !printing.types.includes('Land')
        && printing.color.length === 1
        && printing.color[0] === color
    )
  };

  gold_printings = (): wu.WuIterable<[Printing, number]> => {
    return wu(this.items()).filter(
      ([printing, _]: [Printing, number]) =>
        !printing.types.includes('Land')
        && printing.color.length > 1
    )
  };

  colorless_printings = (): wu.WuIterable<[Printing, number]> => {
    return wu(this.items()).filter(
      ([printing, _]: [Printing, number]) =>
        !printing.types.includes('Land')
        && printing.color.length === 0
    )
  };

  land_printings = (): wu.WuIterable<[Printing, number]> => {
    return wu(this.items()).filter(
      ([printing, _]: [Printing, number]) =>
        printing.types.includes('Land')
    )
  };

  color_grouped_printings = (): IterableIterator<[Printing, number]>[] => {
    return [
      this.printings_of_color('W'),
      this.printings_of_color('U'),
      this.printings_of_color('B'),
      this.printings_of_color('R'),
      this.printings_of_color('G'),
      this.gold_printings(),
      this.colorless_printings(),
      this.land_printings(),
    ]
  };

  type_grouped_printings = (
    filters: [string, string[]][],
    restName: string,
  ): [string, [Printing, number][]][] => {
    // ): any => {
    const groups: { [key: string]: [Printing, number][] } = {};

    for (const [filter_name, filter_types] of filters) {
      groups[filter_name] = []
    }

    groups[restName] = [];

    for (const [printing, multiplicity] of this.items()) {
      let match = false;
      for (const [filter_name, filter_types] of filters) {
        if (
          filter_types.some(
            filter => printing.types.includes(filter)
          )
        ) {
          match = true;
          groups[filter_name].push([printing, multiplicity]);
          break
        }
      }
      if (!match) {
        groups[restName].push([printing, multiplicity]);
      }
    }
    const result: [string, [Printing, number][]][] = filters.map(
      ([filter_name, filters]) => [filter_name, groups[filter_name]]
    );
    result.push([restName, groups[restName]]);
    return result;

  }

}

export class CubeablesContainer {
  printings: PrintingCounter;
  traps: Counter<Trap>;
  tickets: Counter<Ticket>;
  purples: Counter<Purple>;

  constructor(
    printings: PrintingCounter,
    traps: Counter<Trap>,
    tickets: Counter<Ticket>,
    purples: Counter<Purple>,
  ) {
    this.printings = printings;
    this.traps = traps;
    this.tickets = tickets;
    this.purples = purples;
  }

  public static fromRemote(remote: any): CubeablesContainer {
    return new CubeablesContainer(
      new PrintingCounter(
        remote.printings.map(
          ([printing, multiplicity]: [any, number]) => [Printing.fromRemote(printing), multiplicity]
        )
      ),
      new Counter(
        remote.traps.map(
          ([trap, multiplicity]: [any, number]) => [Trap.fromRemote(trap), multiplicity]
        )
      ),
      new Counter(
        remote.tickets.map(
          ([ticket, multiplicity]: [any, number]) => [Ticket.fromRemote(ticket), multiplicity]
        )
      ),
      new Counter(
        remote.purples.map(
          ([purple, multiplicity]: [any, number]) => [Purple.fromRemote(purple), multiplicity]
        )
      ),
    )
  }

  * allPrintings(): IterableIterator<Printing> {
    yield* this.printings.iter();
    for (const trap of this.traps.iter()) {
      yield* trap.node.printings()
    }
  };

  * laps(): IterableIterator<[Cubeable, number]> {
    yield* this.traps.items();
    yield* this.tickets.items();
    yield* this.purples.items();
  };

  * cubeables(): IterableIterator<[Cubeable, number]> {
    yield* this.printings.items();
    yield* this.laps();
  };

  * allCubeables(): IterableIterator<Cubeable> {
    yield* this.printings.iter();
    yield* this.traps.iter();
    yield* this.tickets.iter();
    yield* this.purples.iter();
  };

  traps_of_intention_types = (intention_types: string[]): wu.WuIterable<[Trap, number]> => {
    return wu(this.traps.items()).filter(
      ([trap, multiplicity]: [Trap, number]) => intention_types.includes(trap.intentionType)
    )
  };

  grouped_laps = (): IterableIterator<[Cubeable, number]>[] => {
    return [
      this.traps_of_intention_types(['GARBAGE']),
      this.traps_of_intention_types(['SYNERGY', 'NO_INTENTION']),
      this.traps_of_intention_types(['OR']),
      this.tickets.items(),
      this.purples.items(),
    ]
  };

  grouped_cubeables = (): IterableIterator<[Cubeable, number]>[] => {
    return (
      this.printings.color_grouped_printings() as IterableIterator<[Cubeable, number]>[]
    ).concat(
      this.grouped_laps(),
    )
  };

}


export class CubeRelease extends CubeReleaseMeta {
  cube: MinimalCube;
  cubeablesContainer: CubeablesContainer;
  constrainedNodes: ConstrainedNodes | null;

  constructor(
    id: string,
    name: string,
    createdAt: string,
    intendedSize: string,
    cube: MinimalCube,
    cubeablesContainer: CubeablesContainer,
    constrainedNodes: ConstrainedNodes | null,
  ) {
    super(id, name, createdAt, intendedSize);
    this.cube = cube;
    this.constrainedNodes = constrainedNodes;
    this.cubeablesContainer = cubeablesContainer;
  }

  public static fromRemote(remote: any) {
    return new CubeRelease(
      remote.id,
      remote.name,
      remote.created_at,
      remote.intended_size,
      MinimalCube.fromRemote(remote.versioned_cube),
      CubeablesContainer.fromRemote(remote.cube),
      remote.constrained_nodes ?
        new ConstrainedNodes(remote.constrained_nodes.constrained_nodes.nodes)
        : null,
    )
  }

  public static compare = (from_id: number, to_id: number): Promise<[Patch, VerbosePatch, string | null]> => {
    return axios.get(
      apiPath + 'cube-releases/' + to_id + '/delta-from/' + from_id + '/'
    ).then(
      (response: any) => [
        Patch.fromRemote(response.data.patch),
        VerbosePatch.fromRemote(response.data.verbose_patch),
        response.data.pdf_url,
      ]
    )
  };

  public static all = (): Promise<CubeRelease[]> => {
    // TODO pagination lol
    return axios.get(
      apiPath + 'cube-releases/'
    ).then(
      response => response.data.results.map(
        (release: any) => CubeRelease.fromRemote(release)
      )
    )
  };

  public static get = (id: string): Promise<CubeRelease> => {
    return axios.get(
      apiPath + 'cube-releases/' + id + '/'
    ).then(
      response => CubeRelease.fromRemote(response.data)
    )
  };

  public static samplePack = (id: string, size: number): Promise<CubeablesContainer> => {
    return axios.get(
      apiPath + 'cube-releases/' + id + '/sample-pack/' + size + '/'
    ).then(
      response => CubeablesContainer.fromRemote(response.data)
    )
  };

  filter = (query: string, flattened: boolean = false): Promise<CubeablesContainer> => {
    return axios.get(
      apiPath + 'cube-releases/' + this.id + '/filter/',
      {
        params: {
          query,
          flattened,
        }
      }
    ).then(
      response => CubeablesContainer.fromRemote(response.data)
    )
  }

}


export class Preview {
  cubeables: CubeablesContainer;
  constrainedNodes: ConstrainedNodes;
  groupMap: GroupMap;

  constructor(cubeables: CubeablesContainer, constrainedNodes: ConstrainedNodes, groupMap: GroupMap) {
    this.cubeables = cubeables;
    this.constrainedNodes = constrainedNodes;
    this.groupMap = groupMap;
  }

  public static fromRemote(remote: any): Preview {
    return new Preview(
      CubeablesContainer.fromRemote(remote.cube),
      new ConstrainedNodes(remote.nodes.constrained_nodes.nodes),
      GroupMap.fromRemote(remote.group_map),
    )
  }

}


export class Patch {
  positiveCubeablesContainer: CubeablesContainer;
  negativeCubeablesContainer: CubeablesContainer;
  positiveConstrainedNodes: ConstrainedNodes;
  negativeConstrainedNodes: ConstrainedNodes;

  constructor(
    positiveCubeablesContainer: CubeablesContainer,
    negativeCubeablesContainer: CubeablesContainer,
    positiveConstrainedNodes: ConstrainedNodes,
    negativeConstrainedNodes: ConstrainedNodes,
  ) {
    this.positiveCubeablesContainer = positiveCubeablesContainer;
    this.negativeCubeablesContainer = negativeCubeablesContainer;
    this.positiveConstrainedNodes = positiveConstrainedNodes;
    this.negativeConstrainedNodes = negativeConstrainedNodes;
  }

  public static fromRemote(remote: any): Patch {
    return new Patch(
      new CubeablesContainer(
        new PrintingCounter(
          remote.cube_delta.printings.filter(
            ([cubeable, multiplicity]: [any, number]) => multiplicity > 0
          ).map(
            ([printing, multiplicity]: [any, number]) => [Printing.fromRemote(printing), multiplicity]
          )
        ),
        new Counter(
          remote.cube_delta.traps.filter(
            ([cubeable, multiplicity]: [any, number]) => multiplicity > 0
          ).map(
            ([trap, multiplicity]: [any, number]) => [Trap.fromRemote(trap), multiplicity]
          )
        ),
        new Counter(
          remote.cube_delta.tickets.filter(
            ([cubeable, multiplicity]: [any, number]) => multiplicity > 0
          ).map(
            ([ticket, multiplicity]: [any, number]) => [Ticket.fromRemote(ticket), multiplicity]
          )
        ),
        new Counter(
          remote.cube_delta.purples.filter(
            ([cubeable, multiplicity]: [any, number]) => multiplicity > 0
          ).map(
            ([purple, multiplicity]: [any, number]) => [Purple.fromRemote(purple), multiplicity]
          )
        ),
      ),
      new CubeablesContainer(
        new PrintingCounter(
          remote.cube_delta.printings.filter(
            ([cubeable, multiplicity]: [any, number]) => multiplicity < 0
          ).map(
            ([printing, multiplicity]: [any, number]) => [Printing.fromRemote(printing), multiplicity]
          )
        ),
        new Counter(
          remote.cube_delta.traps.filter(
            ([cubeable, multiplicity]: [any, number]) => multiplicity < 0
          ).map(
            ([trap, multiplicity]: [any, number]) => [Trap.fromRemote(trap), multiplicity]
          )
        ),
        new Counter(
          remote.cube_delta.tickets.filter(
            ([cubeable, multiplicity]: [any, number]) => multiplicity < 0
          ).map(
            ([ticket, multiplicity]: [any, number]) => [Ticket.fromRemote(ticket), multiplicity]
          )
        ),
        new Counter(
          remote.cube_delta.purples.filter(
            ([cubeable, multiplicity]: [any, number]) => multiplicity < 0
          ).map(
            ([purple, multiplicity]: [any, number]) => [Purple.fromRemote(purple), multiplicity]
          )
        ),
      ),
      new ConstrainedNodes(
        remote.node_delta.filter(
          ([node, multiplicity]: [any, number]) => multiplicity > 0
        )
      ),
      new ConstrainedNodes(
        remote.node_delta.filter(
          ([node, multiplicity]: [any, number]) => multiplicity < 0
        )
      ),
    );
  }
}


export class ReleasePatch extends Atomic {
  author: User;
  cube: MinimalCube;
  description: string;
  createdAt: string;
  patch: Patch;
  name: string;

  constructor(
    id: string,
    author: User,
    cube: MinimalCube,
    description: string,
    createdAt: string,
    patch: Patch,
    name: string,
  ) {
    super(id);
    this.author = author;
    this.cube = cube;
    this.description = description;
    this.createdAt = createdAt;
    this.patch = patch;
    this.name = name;
  }

  public static fromRemote(remote: any): ReleasePatch {
    return new ReleasePatch(
      remote.id,
      User.fromRemote(remote.author),
      MinimalCube.fromRemote(remote.versioned_cube),
      remote.description,
      remote.created_at,
      Patch.fromRemote(remote.patch),
      remote.name,
    );
  }

  private static getUpdateJSON(updates: [Cubeable | ConstrainedNode | CubeChange | string, number][]): any {
    let cubeDelta: { [key: string]: any[] } = {
      printings: [],
      traps: [],
      purples: [],
    };
    let nodeDelta: any = {nodes: []};
    let groupDelta: { groups: [string, number][] } = {groups: []};

    let changeUndoes: [any, number][] = [];

    for (const [update, multiplicity] of updates) {

      if (update instanceof Printing) {
        cubeDelta.printings.push(
          [
            update.id,
            multiplicity,
          ]
        );
      } else if (update instanceof Trap) {
        cubeDelta.traps.push(
          [
            update.serialize(),
            multiplicity,
          ]
        );
      } else if (update instanceof Purple) {
        cubeDelta.purples.push(
          [
            update.serialize(),
            multiplicity,
          ]
        );
      } else if (update instanceof ConstrainedNode) {
        nodeDelta.nodes.push(
          [
            update.serialize(),
            multiplicity,
          ]
        );
      } else if (update instanceof CubeChange) {
        changeUndoes.push(
          [
            update.serialize(),
            multiplicity,
          ]
        )
      } else if (typeof update == 'string') {
        groupDelta.groups.push(
          [
            update,
            multiplicity,
          ]
        )
      }

    }

    return {
      update: {
        cube_delta: cubeDelta,
        nodes_delta: nodeDelta,
        groups_delta: groupDelta,
      },
      change_undoes: changeUndoes,
    };
  };

  update = (updates: [Cubeable | ConstrainedNode | CubeChange | string, number][]): Promise<ReleasePatch> => {
    return axios.patch(
      apiPath + 'patches/' + this.id + '/',
      ReleasePatch.getUpdateJSON(updates),
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Token ${store.getState().token}`,
        }
      },
    ).then(
      response => ReleasePatch.fromRemote(response.data)
    )
  };

  public static updateWebsocket(
    connection: WebSocket,
    updates: [Cubeable | ConstrainedNode | CubeChange | string, number][],
  ): void {
    const values = ReleasePatch.getUpdateJSON(updates);
    values['type'] = 'update';
    console.log('websocket send', values);
    connection.send(
      JSON.stringify(
        values
      )
    );
  };

  getEditWebsocket = (): WebSocket => {
    const url = new URL('/ws/patch_edit/' + this.id + '/', window.location.href);
    url.protocol = url.protocol.replace('http', 'ws');
    const ws = new WebSocket(url.href);

    ws.onopen = () => {
      console.log('connected');
      ws.send(
        JSON.stringify(
          {
            type: 'authentication',
            token: store.getState().token,
          }
        )
      );
    };

    ws.onclose = () => {
      console.log('disconnected');
    };

    return ws;
  };

  delete = (): Promise<any> => {
    return axios.delete(
      apiPath + 'patches/' + this.id + '/',
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Token ${store.getState().token}`,
        }
      },
    )
  };

  fork = (): Promise<ReleasePatch> => {
    return axios.post(
      apiPath + 'patches/' + this.id + '/fork/',
      {},
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Token ${store.getState().token}`,
        }
      },
    ).then(
      response => ReleasePatch.fromRemote(response.data)
    )
  };

  preview = (): Promise<Preview> => {
    return axios.get(
      apiPath + 'patches/' + this.id + '/preview/',
    ).then(
      response => Preview.fromRemote(response.data)
    )
  };

  verbose = (): Promise<VerbosePatch> => {
    return axios.get(
      apiPath + 'patches/' + this.id + '/verbose/',
    ).then(
      response => VerbosePatch.fromRemote(response.data)
    )
  };

  report = (): Promise<UpdateReport> => {
    return axios.get(
      apiPath + 'patches/' + this.id + '/report/',
    ).then(
      response => UpdateReport.fromRemote(response.data)
    )
  };

  static create = (cube_id: number, description: string): Promise<ReleasePatch> => {
    return axios.post(
      apiPath + 'patches/',
      {
        description,
        versioned_cube_id: cube_id,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Token ${store.getState().token}`,
        }
      },
    ).then(
      response => ReleasePatch.fromRemote(response.data)
    )
  };

  static all = (): Promise<ReleasePatch[]> => {
    // TODO pagination lol
    return axios.get(
      apiPath + 'patches/'
    ).then(
      response => response.data.results.map(
        (patch: any) => ReleasePatch.fromRemote(patch)
      )
    )
  };

  static forCube = (cubeId: number): Promise<ReleasePatch[]> => {
    // TODO pagination lol
    return axios.get(
      apiPath + 'versioned-cubes/' + cubeId + '/patches/'
    ).then(
      response => response.data.results.map(
        (patch: any) => ReleasePatch.fromRemote(patch)
      )
    )
  };

  static get = (id: string): Promise<ReleasePatch> => {
    return axios.get(
      apiPath + 'patches/' + id + '/'
    ).then(
      response => ReleasePatch.fromRemote(response.data)
    )
  };

}


export class ConstrainedNode extends Atomic {
  node: PrintingNode;
  value: number;
  groups: string[];

  constructor(id: string, printingNode: PrintingNode, value: number, groups: string[]) {
    super(id);
    this.node = printingNode;
    this.value = value;
    this.groups = groups.sort(
      (a, b) => a.toLowerCase() > b.toLowerCase() ? 1 : a.toLowerCase() < b.toLowerCase() ? -1 : 0
    );
  }

  public static fromRemote(remote: any): ConstrainedNode {
    return new ConstrainedNode(
      remote.id,
      PrintingNode.fromRemote(remote.node),
      remote.value,
      remote.groups,
    )
  };

  public static wrappingPrinting(printing: Printing): ConstrainedNode {
    return new ConstrainedNode(
      "",
      new PrintingNode(
        "",
        new MultiplicityList([[printing, 1]]),
        'AllNode',
      ),
      0,
      [],
    )
  };

  public static fromTrap(trap: Trap): ConstrainedNode {
    return new ConstrainedNode(
      "",
      trap.node,
      1,
      [],
    )
  }

  serialize = (): any => {
    return {
      node: this.node.serialize(),
      value: this.value,
      groups: this.groups,
    }
  };

  public static parse(query: string, groups: string, weight: number): Promise<ConstrainedNode> {
    return axios.post(
      apiPath + 'service/parse-constrained-node/',
      {
        query,
        groups,
        weight,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Token ${store.getState().token}`,
        }
      },
    ).then(
      response => ConstrainedNode.fromRemote(response.data)
    )
  }

}


export class ConstrainedNodes {
  nodes: Counter<ConstrainedNode>;

  constructor(nodes: [any, number][]) {
    this.nodes = new Counter(
      nodes.map(
        ([node, multiplicity]: [any, number]) => [ConstrainedNode.fromRemote(node), multiplicity]
      )
    )
  }

  static all = (): Promise<ConstrainedNodes[]> => {
    // TODO pagination lol
    return axios.get(
      apiPath + 'constrained-nodes/'
    ).then(
      response => response.data.results.map(
        (constrainedNode: any) => ConstrainedNode.fromRemote(constrainedNode.nodes.constrained_nodes)
      )
    )
  };

  static get = (id: string): Promise<ConstrainedNodes> => {
    return axios.get(
      apiPath + 'constrained-nodes/' + id + '/'
    ).then(
      response => new ConstrainedNodes(response.data.nodes.constrained_nodes)
    )
  };

}


export class GroupMap {
  groups: { string: number };

  constructor(groups: { string: number }) {
    this.groups = groups;
  }

  public static fromRemote(remote: any): GroupMap {
    return new GroupMap(
      remote.groups,
    )
  }

}


export class CubeChange extends Atomic {
  explanation: string;
  type: string;
  content: any;
  category: string;

  constructor(id: string, explanation: string, type: string, content: any, category: string) {
    super(id);
    this.explanation = explanation;
    this.type = type;
    this.content = content;
    this.category = category
  }

  public static fromRemote(remote: any): CubeChange {
    return new CubeChange(
      remote.id,
      remote.explanation,
      remote.type,
      remote.content,
      remote.category,
    )
  }

  serialize = (): any => {
    return {
      type: this.type,
      content: this.content,
    }
  }

}


export class VerbosePatch {
  changes: Counter<CubeChange>;

  constructor(changes: Counter<CubeChange>) {
    this.changes = changes;
  }

  public static fromRemote(remote: any): VerbosePatch {
    return new VerbosePatch(
      new Counter(
        remote.changes.map(
          ([change, multiplicity]: [any, number]) => [
            CubeChange.fromRemote(change),
            multiplicity,
          ]
        )
      )
    )
  }

}


export class ReportNotification {
  title: string;
  content: string;
  level: string;

  constructor(title: string, content: string, level: string) {
    this.title = title;
    this.content = content;
    this.level = level;
  }

  public static fromRemote(remote: any): ReportNotification {
    return new ReportNotification(
      remote.title,
      remote.content,
      remote.level,
    )
  }

}


export class UpdateReport {
  notifications: ReportNotification[];

  constructor(notifications: ReportNotification[]) {
    this.notifications = notifications;
  }

  public static fromRemote(remote: any): UpdateReport {
    return new UpdateReport(
      remote.notifications.map(
        (notification: any) => ReportNotification.fromRemote(notification)
      )
    )
  }

}


export class EditEvent extends Atomic {
  user: User;
  change: VerbosePatch;

  private static idCounter = 0;

  private static getNextId(): string {
    EditEvent.idCounter += 1;
    return EditEvent.idCounter.toString();
  };

  constructor(user: User, change: VerbosePatch) {
    super(EditEvent.getNextId());
    this.user = user;
    this.change = change;
  }

}


export class Requirement {
  id: string;
  createdAt: string;
  updatedAt: string;

  constructor(id: string, createdAt: string, updatedAt: string) {
    this.id = id;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  name = (): string => {
    return 'Requirement'
  };

  value = (): string => {
    return 'Some value'
  };

  public static fromRemote(remote: any): Requirement {
    return requirementTypeMap[remote.type].fromRemote(remote)
  }

  serialize = (): any => {
    return {}
  };

  create = (cardboardWishId: string): Promise<void> => {
    return axios.post(
      apiPath + 'wishlist/requirement/',
      {
        cardboard_wish_id: cardboardWishId,
        ...this.serialize(),
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Token ${store.getState().token}`,
        }
      },
    )
  };

  public static delete(id: string): Promise<void> {
    return axios.delete(
      apiPath + 'wishlist/requirement/' + id + '/',
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Token ${store.getState().token}`,
        }
      },
    )
  };


}


export class IsBorder extends Requirement {
  border: string;

  constructor(id: string, createdAt: string, updatedAt: string, border: string) {
    super(id, createdAt, updatedAt);
    this.border = border;
  }

  name = (): string => {
    return 'Is border'
  };

  value = (): string => {
    return this.border;
  };

  serialize = (): any => {
    return {
      type: 'IsBorder',
      border: this.border,
    }
  };

  public static fromRemote(remote: any): IsBorder {
    return new IsBorder(
      remote.id,
      remote.created_at,
      remote.udpated_at,
      remote.border,
    )
  }

}

export class FromExpansions extends Requirement {
  expansionCodes: string[];

  constructor(id: string, createdAt: string, updatedAt: string, expansionCodes: string[]) {
    super(id, createdAt, updatedAt);
    this.expansionCodes = expansionCodes;
  }

  name = (): string => {
    return 'From expansions'
  };

  value = (): string => {
    return this.expansionCodes.join(', ');
  };

  serialize = (): any => {
    return {
      type: 'FromExpansions',
      expansions: this.expansionCodes,
    }
  };

  public static fromRemote(remote: any): FromExpansions {
    return new FromExpansions(
      remote.id,
      remote.created_at,
      remote.udpated_at,
      remote.expansion_codes,
    )
  }

}


export class IsMinimumCondition extends Requirement {
  condition: string;

  constructor(id: string, createdAt: string, updatedAt: string, condition: string) {
    super(id, createdAt, updatedAt);
    this.condition = condition;
  }

  name = (): string => {
    return 'Is minimum condition'
  };

  value = (): string => {
    return this.condition;
  };

  serialize = (): any => {
    return {
      type: 'IsMinimumCondition',
      condition: this.condition,
    }
  };

  public static fromRemote(remote: any): IsMinimumCondition {
    return new IsMinimumCondition(
      remote.id,
      remote.created_at,
      remote.udpated_at,
      remote.condition,
    )
  }

}


export class IsLanguage extends Requirement {
  language: string;

  constructor(id: string, createdAt: string, updatedAt: string, language: string) {
    super(id, createdAt, updatedAt);
    this.language = language;
  }

  name = (): string => {
    return 'Is language'
  };

  value = (): string => {
    return this.language;
  };

  serialize = (): any => {
    return {
      type: 'IsLanguage',
      language: this.language,
    }
  };

  public static fromRemote(remote: any): IsLanguage {
    return new IsLanguage(
      remote.id,
      remote.created_at,
      remote.updated_at,
      remote.language,
    )
  }

}


export class IsFoil extends Requirement {
  isFoil: string;

  constructor(id: string, createdAt: string, updatedAt: string, isFoil: string) {
    super(id, createdAt, updatedAt);
    this.isFoil = isFoil;
  }

  name = (): string => {
    return 'Is foil'
  };

  value = (): string => {
    return this.isFoil;
  };

  serialize = (): any => {
    return {
      type: 'IsFoil',
      is_foil: this.isFoil,
    }
  };

  public static fromRemote(remote: any): IsFoil {
    return new IsFoil(
      remote.id,
      remote.created_at,
      remote.udpated_at,
      remote.is_foil,
    )
  }

}


export class IsAltered extends Requirement {
  isAltered: string;

  constructor(id: string, createdAt: string, updatedAt: string, isAltered: string) {
    super(id, createdAt, updatedAt);
    this.isAltered = isAltered;
  }

  name = (): string => {
    return 'Is altered';
  };

  value = (): string => {
    return this.isAltered;
  };

  serialize = (): any => {
    return {
      type: 'IsAltered',
      is_altered: this.isAltered,
    }
  };

  public static fromRemote(remote: any): IsAltered {
    return new IsAltered(
      remote.id,
      remote.created_at,
      remote.udpated_at,
      remote.is_altered,
    )
  }

}


export class IsSigned extends Requirement {
  isSigned: string;

  constructor(id: string, createdAt: string, updatedAt: string, isSigned: string) {
    super(id, createdAt, updatedAt);
    this.isSigned = isSigned;
  }

  name = (): string => {
    return 'Is signed';
  };

  value = (): string => {
    return this.isSigned;
  };

  serialize = (): any => {
    return {
      type: 'IsSigned',
      is_signed: this.isSigned,
    }
  };

  public static fromRemote(remote: any): IsSigned {
    return new IsSigned(
      remote.id,
      remote.created_at,
      remote.udpated_at,
      remote.is_signed,
    )
  }

}


export const requirementTypeMap: { [key: string]: Remoteable<Requirement> } = {
  IsBorder: IsBorder,
  FromExpansions: FromExpansions,
  IsMinimumCondition: IsMinimumCondition,
  IsLanguage: IsLanguage,
  IsFoil: IsFoil,
  IsAltered: IsAltered,
  IsSigned: IsSigned,
};


export class CardboardWish {
  id: string;
  cardboard: Cardboard;
  minimumAmount: number;
  createdAt: Date;
  updatedAt: Date;
  requirements: Requirement[];

  constructor(
    id: string,
    cardboard: Cardboard,
    minimumAmount: number,
    createdAt: Date,
    updatedAt: Date,
    requirements: Requirement[],
  ) {
    this.id = id;
    this.cardboard = cardboard;
    this.minimumAmount = minimumAmount;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.requirements = requirements;
  }

  public static fromRemote(remote: any): CardboardWish {
    return new CardboardWish(
      remote.id,
      Cardboard.fromRemote(remote.cardboard),
      remote.minimum_amount,
      new Date(remote.created_at),
      new Date(remote.updated_at),
      remote.requirements.map(
        (requirement: any) => Requirement.fromRemote(requirement)
      ),
    )
  }

  public static create(
    wishId: string,
    values: { [key: string]: string },
    requirements: Requirement[] | null = null,
  ): Promise<any> {
    let cardboardWish = axios.post(
      apiPath + 'wishlist/cardboard-wish/',
      {
        wish_id: wishId,
        ...values,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Token ${store.getState().token}`,
        }
      },
    );
    if (requirements === null) {
      return cardboardWish
    }

    return cardboardWish.then(
      response => {
        return Promise.all(
          requirements.map(
            requirement => requirement.create(response.data.id)
          )
        )
      }
    );

  };

  public static update(id: string, values: { [key: string]: string }): Promise<CardboardWish> {
    return axios.patch(
      apiPath + 'wishlist/cardboard-wish/' + id + '/',
      values,
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Token ${store.getState().token}`,
        }
      },
    ).then(
      response => CardboardWish.fromRemote(response.data)
    )
  };

  public static delete(id: string): Promise<void> {
    return axios.delete(
      apiPath + 'wishlist/cardboard-wish/' + id + '/',
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Token ${store.getState().token}`,
        }
      },
    )
  };

}


export class Wish {
  id: string;
  weight: number;
  cardboardWishes: CardboardWish[];
  createdAt: Date;
  updatedAt: Date;
  comment: string;

  constructor(
    id: string,
    weight: number,
    cardboardWishes: CardboardWish[],
    createdAt: Date,
    updatedAt: Date,
    comment: string,
  ) {
    this.id = id;
    this.weight = weight;
    this.cardboardWishes = cardboardWishes;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.comment = comment;
  }

  public static fromRemote(remote: any): Wish {
    return new Wish(
      remote.id,
      remote.weight,
      remote.cardboard_wishes.map(
        (cardboardWish: any) => CardboardWish.fromRemote(cardboardWish)
      ),
      new Date(remote.created_at),
      new Date(remote.updated_at),
      remote.comment,
    )
  }

  delete = (): Promise<null> => {
    return axios.delete(
      apiPath + 'wishlist/wish/' + this.id + '/',
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Token ${store.getState().token}`,
        }
      },
    )
  };

  public static update(id: string, values: { [key: string]: string }): Promise<Wish> {
    return axios.patch(
      apiPath + 'wishlist/wish/' + id + '/',
      values,
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Token ${store.getState().token}`,
        }
      },
    ).then(
      response => Wish.fromRemote(response.data)
    )
  };

}


export class WishList {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;


  constructor(id: string, name: string, createdAt: string, updatedAt: string) {
    this.id = id;
    this.name = name;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  public static fromRemote(remote: any): WishList {
    return new WishList(
      remote.id,
      remote.name,
      remote.created_at,
      remote.updated_at,
    )
  }

  public static get = (id: string): Promise<WishList> => {
    return axios.get(
      apiPath + 'wishlist/' + id + '/'
    ).then(
      response => WishList.fromRemote(response.data)
    )
  };

  public static all = (offset: number = 0, limit: number = 50): Promise<PaginationResponse<WishList>> => {
    return axios.get(
      apiPath + 'wishlist/',
      {
        params: {
          offset,
          limit,
        }
      },
    ).then(
      response => {
        return {
          objects: response.data.results.map((wishlist: any) => WishList.fromRemote(wishlist)),
          hits: response.data.count,
        }
      }
    )
  };

  getWishes = (
    offset: number = 0,
    limit: number = 50,
    sortField: string = 'weight',
    sortAscending: boolean = false,
    filters: { [key: string]: string } = {},
  ): Promise<PaginationResponse<Wish>> => {
    return axios.get(
      apiPath + 'wishlist/wishes/' + this.id + '/',
      {
        params: {
          offset,
          limit,
          sort_key: sortField,
          ascending: sortAscending,
          ...filters,
        }
      },
    ).then(
      response => {
        return {
          objects: response.data.results.map(
            (wish: any) => Wish.fromRemote(wish)
          ),
          hits: response.data.count,
        }
      }
    )
  };

  createWish(
    weight: number,
    minimumAmount: number = 1,
    cardboard: Cardboard | null = null,
    requirements: Requirement[] | null = null,
  ): Promise<any> {
    const wishPromise = axios.post(
      apiPath + 'wishlist/wish/',
      {
        weight,
        wish_list_id: this.id,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Token ${store.getState().token}`,
        }
      },
    );

    if (cardboard === null) {
      return wishPromise
    }

    return wishPromise.then(
      response => CardboardWish.create(
        response.data.id,
        {
          cardboard: cardboard.name,
          minimum_amount: minimumAmount.toString(),
        },
        requirements,
      )
    );

  };

}


export class BoosterSpecification extends Atomic {
  sequenceNumber: number;
  amount: number;

  constructor(
    id: string,
    sequenceNumber: number,
    amount: number,
  ) {
    super(id);
    this.sequenceNumber = sequenceNumber;
    this.amount = amount;
  }

  name = (): string => {
    return 'Booster Specification'
  };

  values = (): [string, any][] => {
    return []
  };

  public static fromRemote(remote: any): BoosterSpecification {
    return boosterSpecificationTypeMap[remote.type].fromRemote(remote)
  }
}


export class CubeBoosterSpecification extends BoosterSpecification {
  release: CubeReleaseName;
  size: number;
  allowIntersection: boolean;
  allowRepeat: boolean;

  constructor(
    id: string,
    sequenceNumber: number,
    amount: number,
    release: CubeReleaseName,
    size: number,
    allowIntersection: boolean,
    allowRepeat: boolean,
  ) {
    super(id, sequenceNumber, amount);
    this.release = release;
    this.size = size;
    this.allowIntersection = allowIntersection;
    this.allowRepeat = allowRepeat;
  }

  name = (): string => {
    return 'Cube Booster'
  };

  values = (): [string, any][] => {
    return [
      ['id', this.id],
      [
        'release',
        <Link
          to={'/release/' + this.release.id + '/'}
        >
          {this.release.name}
        </Link>,
      ],
      ['size', this.size,],
      ['intersection', this.allowIntersection],
      ['repeat', this.allowRepeat],
    ]
  };

  public static fromRemote(remote: any): CubeBoosterSpecification {
    return new CubeBoosterSpecification(
      remote.id,
      remote.sequence_number,
      remote.amount,
      CubeReleaseName.fromRemote(remote.release),
      remote.size,
      remote.allow_intersection,
      remote.allow_repeat,
    )
  }
}


export class ExpansionBoosterSpecification extends BoosterSpecification {
  expansionCode: string;

  constructor(
    id: string,
    sequenceNumber: number,
    amount: number,
    expansionCode: string,
  ) {
    super(id, sequenceNumber, amount);
    this.expansionCode = expansionCode;
  }

  name = (): string => {
    return 'Expansion Booster'
  };

  values = (): [string, any][] => {
    return [
      ['id', this.id],
      ['code', this.expansionCode],
    ]
  };

  public static fromRemote(remote: any): ExpansionBoosterSpecification {
    return new ExpansionBoosterSpecification(
      remote.id,
      remote.sequence_number,
      remote.amount,
      remote.expansion_code,
    )
  }

}


export class AllCardsBoosterSpecification extends BoosterSpecification {
  respectPrintings: string;

  constructor(
    id: string,
    sequenceNumber: number,
    amount: number,
    respectPrintings: string,
  ) {
    super(id, sequenceNumber, amount);
    this.respectPrintings = respectPrintings;
  }

  name = (): string => {
    return 'Expansion Booster'
  };

  values = (): [string, any][] => {
    return [
      ['id', this.id],
      ['respect printings', this.respectPrintings],
    ]
  };

  public static fromRemote(remote: any): AllCardsBoosterSpecification {
    return new AllCardsBoosterSpecification(
      remote.id,
      remote.sequence_number,
      remote.amount,
      remote.respect_printings,
    )
  }

}


export const boosterSpecificationTypeMap: { [key: string]: Remoteable<BoosterSpecification> } = {
  CubeBoosterSpecification: CubeBoosterSpecification,
  ExpansionBoosterSpecification: ExpansionBoosterSpecification,
  AllCardsBoosterSpecification: AllCardsBoosterSpecification,
};


export class PoolSpecification extends Atomic {
  boosterSpecifications: BoosterSpecification[];

  constructor(
    id: string,
    boosterSpecifications: BoosterSpecification[],
  ) {
    super(id);
    this.boosterSpecifications = boosterSpecifications;
  }

  public static fromRemote(remote: any): PoolSpecification {
    return new PoolSpecification(
      remote.id,
      remote.specifications.map(
        (boosterSpecification: any) => BoosterSpecification.fromRemote(boosterSpecification)
      ),
    )
  }

}


export class MatchPlayer extends Atomic {
  user: User;
  wins: number;

  constructor(id: string, user: User, wins: number) {
    super(id);
    this.user = user;
    this.wins = wins;
  }

  public static fromRemote(remote: any): MatchPlayer {
    return new MatchPlayer(
      remote.id,
      User.fromRemote(remote.user),
      remote.wins,
    )
  }

}


export class MatchResult extends Atomic {
  draws: number;
  players: MatchPlayer[];

  constructor(id: string, draws: number, players: MatchPlayer[]) {
    super(id);
    this.draws = draws;
    this.players = players;
  }

  public static fromRemote(remote: any): MatchResult {
    return new MatchResult(
      remote.id,
      remote.draws,
      remote.players.map(
        (player: any) => MatchPlayer.fromRemote(player)
      ),
    )
  }

}

export class LimitedSession extends Atomic {
  format: string;
  gameType: string;
  createdAt: Date;
  playingAt: Date | null;
  finishedAt: Date | null;
  name: string;
  players: User[];
  state: string;
  openDecks: boolean;
  poolSpecification: PoolSpecification;
  results: MatchResult[];

  constructor(
    id: string,
    format: string,
    gameType: string,
    createdAt: Date,
    playingAt: Date,
    finishedAt: Date,
    name: string,
    players: User[],
    state: string,
    openDecks: boolean,
    poolSpecification: PoolSpecification,
    results: MatchResult[],
  ) {
    super(id);
    this.format = format;
    this.gameType = gameType;
    this.createdAt = createdAt;
    this.playingAt = playingAt;
    this.finishedAt = finishedAt;
    this.name = name;
    this.players = players;
    this.state = state;
    this.openDecks = openDecks;
    this.poolSpecification = poolSpecification;
    this.results = results;
  }

  public static fromRemote(remote: any): LimitedSession {
    return new LimitedSession(
      remote.id,
      remote.format,
      remote.game_type,
      new Date(remote.created_at),
      remote.playing_at && new Date(remote.playing_at),
      remote.finished_at && new Date(remote.finished_at),
      remote.name,
      remote.players.map((player: any) => User.fromRemote(player)),
      remote.state,
      remote.open_decks,
      PoolSpecification.fromRemote(remote.pool_specification),
      remote.results.map(
        (result: any) => MatchResult.fromRemote(result)
      ),
    )
  }

  public static all(
    offset: number = 0,
    limit: number = 50,
    sortField: string = 'created_at',
    sortAscending: boolean = false,
    filters: { [key: string]: string } = {},
  ): Promise<PaginationResponse<LimitedSession>> {
    return axios.get(
      apiPath + 'limited/sessions/',
      {
        params: {
          offset,
          limit,
          sort_key: sortField,
          ascending: sortAscending,
          ...filters,
        },
      },
    ).then(
      response => {
        return {
          objects: response.data.results.map(
            (session: any) => LimitedSession.fromRemote(session)
          ),
          hits: response.data.count,
        }
      }
    )
  }

  delete = (): Promise<any> => {
    return axios.delete(
      apiPath + 'limited/sessions/' + this.id + '/',
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Token ${store.getState().token}`,
        }
      },
    )
  };

}

export class PoolMeta extends Atomic {
  user: User;
  decks: string[];

  constructor(id: string, user: User, decks: string[]) {
    super(id);
    this.user = user;
    this.decks = decks;
  }

  public static fromRemote(remote: any): PoolMeta {
    return new PoolMeta(
      remote.id,
      User.fromRemote(remote.user),
      remote.decks,
    )
  }

}

export class FullLimitedSession extends LimitedSession {
  pools: PoolMeta[];

  constructor(
    id: string,
    format: string,
    gameType: string,
    createdAt: Date,
    playingAt: Date,
    finishedAt: Date,
    name: string,
    players: User[],
    state: string,
    openDecks: boolean,
    poolSpecification: PoolSpecification,
    results: MatchResult[],
    pools: PoolMeta[],
  ) {
    super(
      id,
      format,
      gameType,
      createdAt,
      playingAt,
      finishedAt,
      name,
      players,
      state,
      openDecks,
      poolSpecification,
      results,
    );
    this.pools = pools;
  }

  public static fromRemote(remote: any): FullLimitedSession {
    return new FullLimitedSession(
      remote.id,
      remote.format,
      remote.game_type,
      new Date(remote.created_at),
      remote.playing_at && new Date(remote.playing_at),
      remote.finished_at && new Date(remote.finished_at),
      remote.name,
      remote.players.map((player: any) => User.fromRemote(player)),
      remote.state,
      remote.open_decks,
      PoolSpecification.fromRemote(remote.pool_specification),
      remote.results.map(
        (result: any) => MatchResult.fromRemote(result)
      ),
      remote.pools.map(
        (pool: any) => PoolMeta.fromRemote(pool)
      ),
    )
  }

  public static get(id: string): Promise<FullLimitedSession> {
    return axios.get(
      apiPath + 'limited/sessions/' + id + '/',
    ).then(
      response => FullLimitedSession.fromRemote(response.data)
    )
  }

}


export class Deck extends Atomic {
  name: string;
  maindeck: PrintingCounter;
  sideboard: PrintingCounter;

  constructor(
    id: string,
    name: string,
    maindeck: PrintingCounter,
    sideboard: PrintingCounter,
  ) {
    super(id);
    this.name = name;
    this.maindeck = maindeck;
    this.sideboard = sideboard;
  }

  public static fromRemote(remote: any): Deck {
    return new Deck(
      remote.id,
      remote.name,
      new PrintingCounter(
        remote.deck.maindeck.map(
          ([printing, multiplicity]: [any, number]) => [Printing.fromRemote(printing), multiplicity]
        )
      ),
      new PrintingCounter(
        remote.deck.sideboard.map(
          ([printing, multiplicity]: [any, number]) => [Printing.fromRemote(printing), multiplicity]
        )
      ),
    )
  }

}


export class Pool extends Atomic {
  user: User;
  decks: Deck[];
  session: LimitedSession;
  pool: CubeablesContainer;

  constructor(
    id: string,
    user: User,
    decks: Deck[],
    session: LimitedSession,
    pool: CubeablesContainer,
  ) {
    super(id);
    this.user = user;
    this.decks = decks;
    this.session = session;
    this.pool = pool;
  }

  public static fromRemote(remote: any): Pool {
    return new Pool(
      remote.id,
      User.fromRemote(remote.user),
      remote.decks.map((deck: any) => Deck.fromRemote(deck)),
      LimitedSession.fromRemote(remote.session),
      CubeablesContainer.fromRemote(remote.pool),
    )
  }

  public static get(id: string): Promise<Pool> {
    return axios.get(
      apiPath + 'limited/pools/' + id + '/',
      {
        headers: store.getState().authenticated && {
          "Authorization": `Token ${store.getState().token}`,
        },
      },
    ).then(
      response => Pool.fromRemote(response.data)
    )
  }

}