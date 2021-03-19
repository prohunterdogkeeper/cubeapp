import React from 'react';

import Tab from "react-bootstrap/Tab";
import Tabs from "react-bootstrap/Tabs";
import {Container, Row} from 'react-bootstrap';
import {Link} from "react-router-dom";

import history from "../../routing/history";
import RatingMapComponentsView from "../../views/rating/RatingMapComponentsView";
import RatingMapView from "../../views/rating/RatingMapView";
import {Loading} from '../../utils/utils';
import {RatingMap} from '../../models/models';


interface RatingMapPageProps {
  match: any
}


interface RatingMapPageState {
  ratingMap: RatingMap | null
}


export default class RatingMapPage extends React.Component<RatingMapPageProps, RatingMapPageState> {

  constructor(props: RatingMapPageProps) {
    super(props);
    this.state = {
      ratingMap: null,
    };
  }

  componentDidMount() {
    RatingMap.get(this.props.match.params.id).then(
      ratingMap => {
        this.setState(
          {ratingMap},
        )
      }
    );
  }

  render() {
    if (this.state.ratingMap === null) {
      return <Loading/>
    }
    return <Container fluid>
      <Row>
        <h3>
          Ratings for <Link to={"/release/" + this.state.ratingMap.release.id}>
          {this.state.ratingMap.explain()}
        </Link>
        </h3>
      </Row>
      {
        this.state.ratingMap.parent && <Row>
          <span>Previous: </span>
          <Link to={"/rating-map/" + this.state.ratingMap.parent.id}>
            {this.state.ratingMap.parent.explain()}
          </Link>
        </Row>
      }
      {
        this.state.ratingMap.children.length !== 0 && <Row>
          <>
            <span>Children: </span>
            <ul>
              {
                this.state.ratingMap.children.map(
                  child => <li>
                    <Link to={"/rating-map/" + child.id}>
                      {child.explain()}
                    </Link>
                  </li>
                )
              }
            </ul>
          </>
        </Row>
      }
      <Row>
        <Tabs
          id='ratings-tabs'
          defaultActiveKey='ratings'
          mountOnEnter={true}
        >
          <Tab eventKey='ratings' title='Ratings'>
            <RatingMapView
              ratingMap={this.state.ratingMap}
              onRatingClicked={
                rating => history.push(
                  '/release/' + this.state.ratingMap.release.id + '/cubeable-details/' + rating.cardboardCubeableId + '/'
                )
              }
            />
          </Tab>
          <Tab eventKey='nodeComponents' title='Node Components'>
            <RatingMapComponentsView ratingMap={this.state.ratingMap}/>
          </Tab>
        </Tabs>
      </Row>
    </Container>
  }

}
