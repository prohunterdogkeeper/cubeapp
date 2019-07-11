import "../../../styling/CubeListView.css";

import React, {ComponentElement} from 'react';

import Row from 'react-bootstrap/Row';

import MapleToolTip from 'reactjs-mappletooltip';

import {CubeableImage} from '../../images';
import {Trap, Ticket, Purple, Printing, CubeRelease, Cubeable} from "../../models/models";


interface TrapItemProps {
  cubeable: Trap | Ticket | Purple
}

const TrapItem: React.FunctionComponent<TrapItemProps> = (props) => {
  if (props.cubeable.type() === 'printing') {
    return <MapleToolTip>
      <div
        className='TrapItem'
      >
        {(props.cubeable as Printing).name()}
      </div>
      <div>
        <CubeableImage
         id={props.cubeable.id()}
        />
      </div>
    </MapleToolTip>
  } else if (props.cubeable.type() === 'trap') {
    return <span>
      {
        (props.cubeable as Trap).node().representation()
      }
    </span>
    // return <div
    //   className='TrapItem'
    // >
    //   ({
    //   (props.cubeable as Trap).node().children().map(
    //       child => <TrapItem {...child}/>
    //     )
    //   })
    // </div>
  // } else if (props.type === 'AnyNode') {
  //   return <div
  //     className='TrapItem'
  //   >
  //     [{
  //       props.children.map(
  //         child => <TrapItem {...child}/>
  //       )
  //     }]
  //   </div>
  } else {
    throw 'Invalid trap item type: ' + props.cubeable.type();
  }
};


interface CubeListItemProps {
  cubeable: Cubeable
}

const CubeableListItem: React.FunctionComponent<CubeListItemProps> = (props) => {
  let content: string | ComponentElement<any, any> = "";

  if (props.cubeable.type() === 'printing') {
    console.log(props.cubeable.id());
    content = <MapleToolTip>
        <div>
          {(props.cubeable as Printing).name()}
        </div>
        <span>
          <CubeableImage
            id={props.cubeable.id()}
          />
      </span>
      </MapleToolTip>

  } else if (props.cubeable.type() === 'trap') {
    content = <TrapItem cubeable={props.cubeable}/>

  } else if (props.cubeable.type() === 'ticket') {
    content = 'ticket';

  } else if (props.cubeable.type() === 'purple') {
    content = (props.cubeable as Purple).name();

  } else {
    content = 'Unknown cubeable type';
  }

  return <li>
    {content}
  </li>

};


interface ReleaseListViewProps {
  release: CubeRelease
}

class ReleaseListView extends React.Component<ReleaseListViewProps> {

  render() {
    return <div
    >
      <Row>
        {
          this.props.release.grouped_cubeables().map(
            group => {
              return <div>
                <ul>
                  {
                    group.map(
                      cubeable => <CubeableListItem
                        cubeable={cubeable}
                      />
                    )
                  }
                </ul>
              </div>
            }
          )
        }
      </Row>
    </div>
  }
}

export default ReleaseListView;